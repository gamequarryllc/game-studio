// What Plainlimit Pro adds, and how a setting reads for someone without it.
// The battery, Essentials, sums, the recharge, the settings lock, emergency
// passes, the widget and the week stay free for good (the owner, 2026-11-17).

import type { SumLevel } from './puzzle';
import type { Settings } from './types';

/** The lines on the Pro screen, in the order they are shown. */
export const PRO_FEATURES: readonly { title: string; line: string }[] = [
  { title: 'Second thought', line: 'One sum before the apps you open without deciding to' },
  { title: 'Your recharge time', line: 'Recharge at 5 AM, 7 AM, midnight or any half hour' },
  { title: 'Sum difficulty', line: 'Easy, normal or hard sums when you earn time' },
];

/** The sums someone gets: their choice with Pro, normal without it (a refund falls back to normal). */
export function sumLevelFor(settings: Settings, isPro: boolean): SumLevel {
  return isPro ? (settings.sumLevel ?? 'normal') : 'normal';
}
