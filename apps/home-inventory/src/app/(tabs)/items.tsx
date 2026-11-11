import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMoney } from '@/domain/money';
import { findItems, hasValue, homeSummary, itemTotalCents, plural, type ItemFilter, type ItemSort } from '@/domain/selectors';
import type { Item } from '@/domain/types';
import { tap } from '@/platform/haptics';
import { openNewItem } from '@/state/nav';
import { useDoc } from '@/state/store';
import { choose } from '@/ui/dialogs';
import { Icon } from '@/ui/Icon';
import { Button, Chip, EmptyState, RoundButton, Thumb } from '@/ui/kit';
import { HAIRLINE, NO_OUTLINE, radius, space, TAB_BAR_SPACE, type, useTheme } from '@/ui/theme';

const FILTERS: ItemFilter[] = ['all', 'no-photo', 'no-value', 'no-serial'];
const SORT_LABELS: Record<ItemSort, string> = { recent: 'Newest first', value: 'Most valuable first', name: 'Name, A to Z' };

const isFilter = (v: unknown): v is ItemFilter => typeof v === 'string' && (FILTERS as string[]).includes(v);

export default function ItemsTab() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const doc = useDoc();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ItemSort>('recent');
  const [filter, setFilter] = useState<ItemFilter>('all');
  // Arriving from a "worth filling in" row on the Rooms tab picks that filter once.
  const [seenParam, setSeenParam] = useState<string | undefined>(undefined);
  if (params.filter !== seenParam) {
    setSeenParam(params.filter);
    if (isFilter(params.filter)) setFilter(params.filter);
  }

  const summary = homeSummary(doc);
  const currency = doc.settings.currency;
  const roomNames = new Map(doc.rooms.map((r) => [r.id, r.name]));
  const items = findItems(doc, { query, filter, sort });
  const counts: Record<ItemFilter, number> = {
    all: summary.count,
    'no-photo': summary.count - summary.withPhoto,
    'no-value': summary.count - summary.withValue,
    'no-serial': summary.missingSerial,
  };
  const labels: Record<ItemFilter, string> = { all: 'All', 'no-photo': 'No photo', 'no-value': 'No value', 'no-serial': 'Missing serial' };

  const pickSort = async () => {
    const picked = await choose<ItemSort>({ title: 'Sort items', choices: (Object.keys(SORT_LABELS) as ItemSort[]).map((k) => ({ key: k, label: SORT_LABELS[k] })) });
    if (picked) setSort(picked);
  };

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink, flex: 1 }]}>
          Items
        </Text>
        <RoundButton testID="items-add" icon="add" label="Add an item" onPress={() => openNewItem(router)} />
      </View>
      {summary.count > 0 ? (
        <>
          <View style={[styles.search, { backgroundColor: c.sunk }]}>
            <Icon name="search" size={17} color={c.ink2} />
            <TextInput
              testID="items-search"
              accessibilityLabel="Search items"
              value={query}
              onChangeText={setQuery}
              placeholder="Name, brand, serial number"
              placeholderTextColor={c.ink2}
              selectionColor={c.green}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, paddingVertical: 0 }]}
            />
            {query !== '' && Platform.OS !== 'ios' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
                <Icon name="clear" size={17} color={c.ink3} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {FILTERS.map((f) => (
              <Chip key={f} testID={`filter-${f}`} label={labels[f]} count={f === 'all' ? undefined : counts[f]} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>
          <View style={styles.meta}>
            <Text testID="items-count" style={[type.footnote, { color: c.ink2, flex: 1 }]}>
              {query || filter !== 'all' ? `${plural(items.length, 'item')} found` : plural(items.length, 'item')}
            </Text>
            <Pressable
              testID="items-sort"
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
              hitSlop={10}
              onPress={() => {
                tap();
                void pickSort();
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="sort" size={13} color={c.green} />
              <Text style={[type.footnote, { color: c.green, fontWeight: '600' }]}>{SORT_LABELS[sort]}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );

  const renderItem = ({ item, index }: { item: Item; index: number }) => {
    const first = index === 0;
    const last = index === items.length - 1;
    return (
      <Pressable
        testID={`item-${item.name}`}
        accessibilityRole="button"
        onPress={() => {
          tap();
          router.push({ pathname: '/item/[id]', params: { id: item.id } });
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? c.sunk : c.card,
            borderColor: c.rule,
            borderTopLeftRadius: first ? radius.m : 0,
            borderTopRightRadius: first ? radius.m : 0,
            borderBottomLeftRadius: last ? radius.m : 0,
            borderBottomRightRadius: last ? radius.m : 0,
            borderTopWidth: first ? HAIRLINE : 0,
            borderBottomWidth: HAIRLINE,
          },
        ]}>
        <Thumb photoId={item.photos[0]?.id} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { color: c.ink }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[type.footnote, { color: c.ink2 }]} numberOfLines={1}>
            {roomNames.get(item.roomId) ?? ''}
            {item.quantity > 1 ? ` · ${item.quantity} of them` : ''}
          </Text>
        </View>
        <Text style={[type.callout, type.tabular, { color: hasValue(item) ? c.ink : c.amber }]}>
          {hasValue(item) ? formatMoney(itemTotalCents(item), currency, { whole: true }) : 'No value'}
        </Text>
        <Icon name="chevron" size={13} color={c.ink3} />
      </Pressable>
    );
  };

  return (
    <FlatList
      testID="items-screen"
      style={{ flex: 1, backgroundColor: c.paper }}
      contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 22 : 10), paddingBottom: TAB_BAR_SPACE }}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        summary.count === 0 ? (
          <EmptyState
            icon="tabItems"
            title="Nothing filed yet"
            body="Everything you add shows up here, in one list you can search."
            action={<Button testID="items-add-first" label="Add your first item" icon="add" onPress={() => openNewItem(router)} />}
          />
        ) : (
          <EmptyState
            icon="search"
            title={filter === 'all' ? 'No matches' : 'Nothing to fix here'}
            body={query ? `Nothing matches “${query}”${filter === 'all' ? '.' : ' with this filter.'}` : 'Every item passes this check.'}
          />
        )
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={14}
      windowSize={9}
    />
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, marginBottom: space.m },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginHorizontal: space.xl, height: 38, borderRadius: 10, paddingHorizontal: 10 },
  chips: { gap: space.s, paddingHorizontal: space.xl, paddingTop: space.m },
  meta: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.xl + space.xs, marginTop: space.l, marginBottom: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginHorizontal: space.xl,
    paddingHorizontal: space.m,
    paddingVertical: 9,
    borderLeftWidth: HAIRLINE,
    borderRightWidth: HAIRLINE,
  },
});
