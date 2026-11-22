import { View } from 'react-native';

import { freshRecord, passActive, recordView, type RecordView } from '@/domain/record';
import type { DaySummary, Doc } from '@/domain/types';
import { useDoc, useNow } from '@/state/store';

import { c } from './theme';

// The record (record.ts): the numbers for History and the pass sheet, and the mark for a pass day.

/** The record as the screens show it, kept up to date with the clock. */
export function useRecord(): { view: RecordView; doc: Doc; now: Date; running: boolean } {
  const doc = useDoc();
  const now = useNow();
  const record = doc.record ?? freshRecord(now);
  const today: DaySummary = { start: doc.day.periodStart, goalMinutes: doc.settings.goalMinutes, usedMinutes: doc.day.usedMinutes, topUps: doc.day.topUps, state: doc.day.uncounted ? 'partly' : 'counted' };
  return { view: recordView(record, doc.history, today, now, doc.settings.rechargeMinute), doc, now, running: passActive(record, now) };
}

/** The one mark for a day a pass was used: on the record's grid and on Today's Last 7 days. */
export function PassDot({ size = 6 }: { size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.ink, borderWidth: 1, borderColor: c.ground }} />;
}

export function weekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}
