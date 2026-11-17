import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { freshRecord, passActive, recordView, type RecordView } from '@/domain/record';
import type { DaySummary, Doc } from '@/domain/types';
import { useDoc, useNow } from '@/state/store';

import { tap } from '@/platform/haptics';
import { c, display } from './theme';

// The record (record.ts): a card on Today, and the numbers for its own screen.

/** The record as the screens show it, kept up to date with the clock. */
export function useRecord(): { view: RecordView; doc: Doc; now: Date; running: boolean } {
  const doc = useDoc();
  const now = useNow();
  const record = doc.record ?? freshRecord(now);
  const today: DaySummary = { start: doc.day.periodStart, goalMinutes: doc.settings.goalMinutes, usedMinutes: doc.day.usedMinutes, topUps: doc.day.topUps, state: doc.day.uncounted ? 'partly' : 'counted' };
  return { view: recordView(record, doc.history, today, now, doc.settings.rechargeMinute), doc, now, running: passActive(record, now) };
}

export function weekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

export function RecordCard() {
  const router = useRouter();
  const { view } = useRecord();
  const passes = view.passes === 1 ? 'pass banked' : 'passes banked';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your record: ${view.streakWeeks} weeks without an emergency pass, ${view.perfectWeeks} perfect weeks, ${view.passes} ${passes}`}
      onPress={() => {
        tap();
        router.push('/record');
      }}
      style={({ pressed }) => [styles.card, pressed ? { opacity: 0.8 } : null]}>
      <View style={styles.head}>
        <Text style={styles.label}>Your record</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.big}>{view.streakWeeks} wk</Text>
          <Text style={styles.small}>without an emergency</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.big, { color: '#46CC70' }]}>{view.perfectWeeks}</Text>
          <Text style={styles.small}>perfect weeks</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.big}>{view.passes}</Text>
          <Text style={styles.small}>{passes}</Text>
        </View>
      </View>
      <Text style={styles.foot}>Next pass on {weekday(view.nextPass)}.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, borderRadius: 22, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '600', color: c.ink3 },
  chevron: { fontSize: 22, color: c.ink3, marginTop: -2 },
  row: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2 },
  big: { fontFamily: display.bold, fontSize: 30, letterSpacing: -0.8, color: c.ink },
  small: { fontSize: 13, lineHeight: 17, color: c.ink3 },
  foot: { fontSize: 14, lineHeight: 19, color: c.ink2, borderTopWidth: 1, borderTopColor: c.rule, paddingTop: 12 },
});
