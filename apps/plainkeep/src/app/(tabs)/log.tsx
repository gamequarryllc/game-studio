import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { dayOfMonth, monthAbbr } from '@/domain/dates';
import { distanceText } from '@/domain/labels';
import { formatMoney } from '@/domain/money';
import { logByYear, matchesSearch } from '@/domain/selectors';
import type { Entry } from '@/domain/types';
import { tap } from '@/platform/haptics';
import { useDoc } from '@/state/store';
import { choose } from '@/ui/dialogs';
import { Icon } from '@/ui/Icon';
import { Button, Card, Chip, Divider, EmptyState, Footnote, RoundButton, SectionLabel, TabScreen } from '@/ui/kit';
import { NO_ORPHAN, NO_OUTLINE, plate, radius, space, type, useTheme } from '@/ui/theme';

function EntryRow({ entry, thingName, showThing, onPress }: { entry: Entry; thingName: string; showThing: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const doc = useDoc();
  const unit = doc.settings.distanceUnit;
  const under = [showThing ? thingName : null, entry.skipped ? 'Skipped' : null, entry.distance !== null && !entry.skipped ? distanceText(entry.distance, unit) : null].filter(Boolean).join(' · ');
  const note = entry.note.replace(/\n+/g, ' ');
  return (
    <Pressable
      testID={`entry-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}, ${monthAbbr(entry.ymd)} ${dayOfMonth(entry.ymd)}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: c.sunk } : null]}>
      {/* The date, stamped the way a service sticker has it. */}
      <View style={styles.stamp}>
        <Text style={[styles.stampDay, { color: entry.skipped ? c.ink3 : c.ink }]}>{dayOfMonth(entry.ymd)}</Text>
        <Text style={[type.caption, { color: c.ink2 }]}>{monthAbbr(entry.ymd)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, NO_ORPHAN, { color: entry.skipped ? c.ink2 : c.ink }]} numberOfLines={2} lineBreakStrategyIOS="push-out">
          {entry.title}
        </Text>
        {under ? (
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={1}>
            {under}
          </Text>
        ) : null}
        {note ? (
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      {entry.cost !== null ? <Text style={[type.body, type.tabular, { color: c.ink2 }]}>{formatMoney(entry.cost, doc.settings.currency)}</Text> : null}
      <Icon name="chevron" size={13} color={c.ink3} />
    </Pressable>
  );
}

export default function LogTab() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ thingId?: string }>();
  const doc = useDoc();
  const [filter, setFilter] = useState<string | null>(params.thingId ?? null);
  const [query, setQuery] = useState('');
  // Arriving from a thing's screen shows that thing's lines.
  const [arrivedFor, setArrivedFor] = useState(params.thingId);
  if (params.thingId !== arrivedFor) {
    setArrivedFor(params.thingId);
    if (params.thingId) setFilter(params.thingId);
  }

  const names = new Map(doc.things.map((t) => [t.id, t.name]));
  const active = filter && names.has(filter) ? filter : null;
  const shown = doc.entries.filter((e) => (active === null || e.thingId === active) && matchesSearch(e, names.get(e.thingId) ?? '', query));
  const years = logByYear(shown);

  const add = async () => {
    if (doc.things.length === 0) {
      router.push('/thing-form');
      return;
    }
    if (active) {
      router.push({ pathname: '/done', params: { thingId: active } });
      return;
    }
    if (doc.things.length === 1) {
      router.push({ pathname: '/done', params: { thingId: doc.things[0].id } });
      return;
    }
    const picked = await choose({ title: 'Which is it for?', choices: doc.things.map((t) => ({ key: t.id, label: t.name })) });
    if (picked) router.push({ pathname: '/done', params: { thingId: picked } });
  };

  const action = <RoundButton testID="add-entry" icon="add" label="Log something that was done" onPress={add} />;

  if (doc.entries.length === 0) {
    return (
      <TabScreen testID="log-screen" title="Log" action={action}>
        <EmptyState
          title="Nothing logged yet"
          body="Each job you mark done lands here, with its date, cost and reading. Repairs and one-offs can be logged too."
          action={<Button testID="log-empty-add" label={doc.things.length > 0 ? 'Log something' : 'Add something to look after'} onPress={add} />}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen testID="log-screen" title="Log" action={action}>
      <View style={[styles.search, { backgroundColor: c.sunk }]}>
        <Icon name="search" size={16} color={c.ink3} />
        <TextInput
          testID="log-search"
          accessibilityLabel="Search the log"
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={c.ink3}
          selectionColor={c.blue}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, paddingVertical: 8 }]}
        />
        {query !== '' ? (
          <Pressable testID="log-search-clear" accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
            <Icon name="clear" size={17} color={c.ink3} />
          </Pressable>
        ) : null}
      </View>

      {doc.things.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.xl, paddingTop: space.m }} keyboardShouldPersistTaps="handled">
          <Chip testID="filter-all" label="Everything" selected={active === null} onPress={() => setFilter(null)} />
          {doc.things.map((t) => (
            <Chip key={t.id} testID={`filter-${t.id}`} label={t.name} selected={active === t.id} onPress={() => setFilter(t.id)} />
          ))}
        </ScrollView>
      ) : null}

      {years.length === 0 ? (
        <Footnote style={{ marginTop: space.xl }}>{query.trim() !== '' ? `No entries match “${query.trim()}”.` : 'Nothing logged for this one yet.'}</Footnote>
      ) : (
        years.map((group) => (
          <Fragment key={group.year}>
            <SectionLabel
              testID={`year-${group.year}`}
              trailing={group.spent !== null ? <Text testID={`spent-${group.year}`} style={[type.subhead, type.tabular, { color: c.ink2 }]}>{formatMoney(group.spent, doc.settings.currency)} spent</Text> : undefined}>
              {String(group.year)}
            </SectionLabel>
            <Card>
              {group.entries.map((e, i) => (
                <Fragment key={e.id}>
                  {i > 0 ? <Divider inset={space.l + 34 + space.m} /> : null}
                  <EntryRow entry={e} thingName={names.get(e.thingId) ?? ''} showThing={active === null && doc.things.length > 1} onPress={() => router.push({ pathname: '/done', params: { entryId: e.id } })} />
                </Fragment>
              ))}
            </Card>
          </Fragment>
        ))
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginHorizontal: space.xl, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: 38 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 64 },
  stamp: { width: 34, alignItems: 'center', justifyContent: 'center' },
  stampDay: { fontFamily: plate.semibold, fontSize: 24, lineHeight: 25 },
});
