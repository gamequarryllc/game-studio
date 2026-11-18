// What Plainlimit Pro adds, and how a setting reads for someone without it.
// The battery, Essentials, sums, the recharge, the settings lock, emergency
// passes, the widget and the week stay free for good (the owner, 2026-11-17).
// Pro in 1.1 is three things that have been tried on a phone: the recharge
// time, sum difficulty and the large widget. Second thought and the lock
// message are free until they have been too; then they move to Pro (the
// owner, 2026-11-18).

import type { SumLevel } from './puzzle';
import type { RecordView } from './record';
import type { Settings } from './types';

/** The lines on the Pro screen, in the order they are shown. */
export const PRO_FEATURES: readonly { title: string; line: string }[] = [
  { title: 'Your recharge time', line: 'Recharge at 5 AM, 7 AM, midnight or any half hour' },
  { title: 'Sum difficulty', line: 'Easy, normal or hard sums when you earn time' },
  { title: 'Large widget', line: 'Your battery, streak, passes and week on the Home Screen' },
];

/** The sums someone gets: their choice with Pro, normal without it (a refund falls back to normal). */
export function sumLevelFor(settings: Settings, isPro: boolean): SumLevel {
  return isPro ? (settings.sumLevel ?? 'normal') : 'normal';
}

/**
 * What the large Home Screen widget draws besides the battery (Pro), saved in
 * the App Group as `plainlimit_record`. `week` is this week, Monday to Sunday:
 * u under the goal, r ran out, p partly counted, n not counted, f still to come.
 */
export interface WidgetRecord {
  pro: boolean;
  streak: number;
  passes: number;
  perfect: number;
  week: string;
}

const CELL_LETTER = { under: 'u', ranOut: 'r', partly: 'p', none: 'n', future: 'f' } as const;

export function widgetRecord(view: RecordView, isPro: boolean): WidgetRecord {
  const thisWeek = view.weeks[view.weeks.length - 1];
  const week = (thisWeek?.days ?? []).map((d) => CELL_LETTER[d.cell]).join('').padEnd(7, 'f').slice(0, 7);
  return { pro: isPro, streak: view.streakWeeks, passes: view.passes, perfect: view.perfectWeeks, week };
}
