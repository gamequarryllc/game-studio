import { cellsLeft, fractionUsed } from '@/domain/battery';
import { accentOnDark, toneAt } from '@/domain/tone';
import { useDoc, useNow } from '@/state/store';

/** Where the day stands, and the colour that goes with it. */
export function useDay() {
  const now = useNow();
  const { settings, day } = useDoc();
  const fraction = fractionUsed(day.usedMinutes, settings.goalMinutes);
  const tone = toneAt(fraction);
  return { now, settings, day, fraction, cells: cellsLeft(day.usedMinutes, settings.goalMinutes), tone, accent: accentOnDark(tone) };
}
