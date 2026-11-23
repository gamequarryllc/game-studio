// What Plainlimit Pro adds, and how a setting reads for someone without it.
// The battery, Essentials, sums, the recharge, the settings lock, emergency
// passes, the widget and the week stay free for good (the owner, 2026-11-17).
// Pro in 1.1 is the recharge time, sum difficulty, the large widget (the
// owner, 2026-11-18), a lock message in one's own words (2026-11-21; the
// ready-made messages stay free) and Second thought (2026-11-23: it was free
// while it was being tried on a phone, and was always meant for Pro).

import { DEFAULT_ASK_FIRST, type AskFirst } from './askFirst';
import type { SumLevel } from './puzzle';
import type { RecordView } from './record';
import type { Settings } from './types';

/** The lines on the Pro screen, in the order they are shown. */
export const PRO_FEATURES: readonly { title: string; line: string }[] = [
  { title: 'Second thought', line: 'One sum before the apps you open without thinking' },
  { title: 'Your recharge time', line: 'Recharge at 5 AM, 7 AM, midnight or any half hour' },
  { title: 'Sum difficulty', line: 'Easy, normal or hard sums when you earn time' },
  { title: 'Large widget', line: 'Your battery, streak, passes and week on the Home Screen' },
  { title: 'Your own lock message', line: 'Your words on the screen when an app is locked' },
];

/** The sums someone gets: their choice with Pro, normal without it (a refund falls back to normal). */
export function sumLevelFor(settings: Settings, isPro: boolean): SumLevel {
  return isPro ? (settings.sumLevel ?? 'normal') : 'normal';
}

/**
 * Second thought as it runs: the saved choice with Pro, off without it. The
 * choice itself is kept, so a refund switches it off and buying again (or
 * Restore on a new iPhone) brings it back as it was.
 */
export function askFirstFor(settings: Settings, isPro: boolean): AskFirst {
  const ask = settings.askFirst ?? DEFAULT_ASK_FIRST;
  return isPro || !ask.on ? ask : { ...ask, on: false };
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
  return { pro: isPro, streak: view.streakDays, passes: view.passes, perfect: view.perfectWeeks, week };
}
