import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dueText } from '@/domain/labels';
import { FREE_THING_LIMIT } from '@/domain/limits';
import { currentReading, listJobs, type Listed } from '@/domain/schedule';
import type { Thing } from '@/domain/types';
import { tap } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { useToday } from '@/state/clock';
import { openNewThing } from '@/state/nav';
import { useDoc } from '@/state/store';
import { standing } from '@/ui/due';
import { Icon, thingIconName } from '@/ui/Icon';
import { Button, EmptyState, Footnote, IconPlate, LinkText, RoundButton, TabScreen } from '@/ui/kit';
import { Odometer } from '@/ui/Odometer';
import { HAIRLINE, NO_ORPHAN, plate, radius, space, toneColor, type, useTheme } from '@/ui/theme';

function ThingTag({ thing, jobs, onPress }: { thing: Thing; jobs: Listed[]; onPress: () => void }) {
  const { c } = useTheme();
  const doc = useDoc();
  const today = useToday();
  const unit = doc.settings.distanceUnit;
  const tone = standing(jobs);
  // The list is already in order: the first live job is the most pressing one.
  const live = jobs.filter((j) => j.due.state !== 'paused' && j.due.state !== 'finished');
  const next = live[0];
  const overdue = live.filter((j) => j.due.state === 'overdue').length;
  const coming = live.filter((j) => j.due.state === 'today' || j.due.state === 'soon').length;
  const unlogged = live.filter((j) => j.due.state === 'unlogged').length;
  const counts = [overdue > 0 ? `${overdue} overdue` : null, coming > 0 ? `${coming} coming up` : null].filter(Boolean);
  const headline =
    jobs.length === 0 ? 'No jobs yet' : live.length === 0 ? 'Everything is paused' : counts.length > 0 ? counts.join(' · ') : unlogged === live.length ? `${unlogged} not logged yet` : 'All in good time';
  const under = next ? (next.due.state === 'unlogged' ? `${next.job.name} and the rest need a first date` : `${next.job.name}: ${dueText(next.due, unit, today).replace(/^Due /, '')}`) : jobs.length === 0 ? 'Add the jobs that come round' : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`;
  const reading = thing.kind === 'vehicle' ? currentReading(thing) : null;
  return (
    <Pressable
      testID={`thing-${thing.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${thing.name}, ${under}, ${headline}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.tag, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.head}>
        <IconPlate name={thingIconName(thing.icon)} size={40} tone={tone === 'muted' ? 'blue' : tone} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, NO_ORPHAN, { color: c.ink }]} numberOfLines={1}>
            {thing.name}
          </Text>
          {thing.detail ? (
            <Text style={[type.footnote, { color: c.ink2 }]} numberOfLines={1}>
              {thing.detail}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron" size={14} color={c.ink3} />
      </View>
      <View style={[styles.foot, { borderTopColor: c.rule }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID={`thing-status-${thing.id}`} style={[type.subhead, { color: tone === 'muted' ? c.ink2 : toneColor(c, tone), fontWeight: '600' }]} numberOfLines={1}>
            {headline}
          </Text>
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={2}>
            {under}
          </Text>
        </View>
        {thing.kind === 'vehicle' ? <Odometer value={reading?.value ?? null} unit={unit} size="s" /> : null}
      </View>
    </Pressable>
  );
}

export default function ThingsTab() {
  const router = useRouter();
  const doc = useDoc();
  const today = useToday();
  const isPro = usePro().isPro;
  const listed = listJobs(doc, today);
  const full = !isPro && doc.things.length >= FREE_THING_LIMIT;

  return (
    <TabScreen testID="things-screen" title="Things" action={<RoundButton testID="add-thing" icon="add" label="Add something to look after" onPress={() => openNewThing(router)} />}>
      {doc.things.length === 0 ? (
        <EmptyState
          title="What do you look after?"
          body="A home, a car, a mower, a boat. Each gets its own jobs and its own log."
          action={<Button testID="things-empty-add" label="Add the first one" onPress={() => openNewThing(router)} />}
        />
      ) : (
        <View style={{ gap: space.m, paddingHorizontal: space.xl }}>
          {doc.things.map((thing) => (
            <ThingTag key={thing.id} thing={thing} jobs={listed.filter((l) => l.thing.id === thing.id)} onPress={() => router.push({ pathname: '/thing/[id]', params: { id: thing.id } })} />
          ))}
        </View>
      )}
      {full ? (
        <View style={{ marginHorizontal: space.xl + 2, marginTop: space.l, gap: space.xs }}>
          <Footnote style={{ marginHorizontal: 0, marginTop: 0 }}>The free version looks after {FREE_THING_LIMIT} things, with everything they need. Pro adds as many as you have.</Footnote>
          <LinkText testID="things-pro" label="See Plainkeep Pro" onPress={() => router.push('/pro')} />
        </View>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  tag: { borderRadius: radius.m, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.m, paddingRight: space.l + 4 },
  name: { fontFamily: plate.semibold, fontSize: 26, lineHeight: 28, letterSpacing: 0.2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, borderTopWidth: HAIRLINE },
});
