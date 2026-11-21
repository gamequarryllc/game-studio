import { cellsLeft, fractionUsed } from '@/domain/battery';
import { accentOnDark, toneAt } from '@/domain/tone';
import { useDoc, useNow, useStoreValue } from '@/state/store';

/** Where the day stands, and the colour that goes with it. */
export function useDay() {
  const now = useNow();
  const { settings, day } = useDoc();
  const fraction = fractionUsed(day.usedMinutes, settings.goalMinutes);
  const tone = toneAt(fraction);
  return { now, settings, day, fraction, cells: cellsLeft(day.usedMinutes, settings.goalMinutes), tone, accent: accentOnDark(tone) };
}

/** Only the battery's colour, for the tab bar: redrawn when the colour changes, not on every change to the day. */
export function useAccent(): string {
  return useStoreValue((s) => accentOnDark(toneAt(fractionUsed(s.doc.day.usedMinutes, s.doc.settings.goalMinutes))));
}
