// Counting everything, less the essentials.
//
// Up to 1.1 the phone was handed every app by name, less the essentials, and
// counted those. That needed Apple's list with everything ticked once (setup's
// first list), and "Refresh list" for apps installed later. Apple's timers
// count everything when they are given no apps at all, so the day's
// checkpoints are now registered that way: nothing to tick, and a new app
// counts from its first minute.
//
// Apple has no "everything except these" for counting (only for the lock).
// So the essentials get a timer of their own, a ladder of rungs, and what
// uses the battery is the one less the other:
//
//   used = everything - essentials
//
// The phone only says when a rung is reached, never the minutes in between,
// so the essentials' minutes are only known to lie between their last rung
// and the next. Whenever that matters the rule takes the next rung: the
// essentials are given the benefit of the doubt, and the battery never locks
// before the goal is used. It can lock up to one rung late on a day the
// essentials were used.
//
// The same rule is applied in three places, which must stay in step:
// here (the app), the monitor extension (patches/, `plainlimitTally`) and the
// widget (targets/widget). src/domain/__tests__/tally.test.ts replays days
// against it.

import type { Checkpoint, Mark } from './checkpoints';

/** The essentials' own timer. Names must not contain "_". */
export const KEPT_ACTIVITY = 'plkept';
/** The everything timer's rungs past the goal, which lock once the essentials' minutes are taken off. */
export const OVER_ACTIVITY = 'plover';

/**
 * The essentials' rungs, in minutes: every minute to five, every five to two
 * hours, then wider. 48 of them, as many as one registration is trusted with
 * (Second thought's runs 60). The step is how late a lock can land.
 */
export const KEPT_MINUTES: readonly number[] = (() => {
  const out = [1, 2, 3, 4, 5];
  for (let m = 10; m <= 120; m += 5) out.push(m);
  for (let m = 135; m <= 240; m += 15) out.push(m);
  for (let m = 270; m <= 480; m += 30) out.push(m);
  for (let m = 540; m <= 720; m += 60) out.push(m);
  return out;
})();

/** The essentials' rungs as checkpoints: "k5" is five minutes in the essentials. They change nothing by themselves. */
export function keptRungs(): Checkpoint[] {
  return KEPT_MINUTES.map((m) => ({ id: `k${m}`, minutes: m, effect: 'tick' as const }));
}

/**
 * The everything timer's rungs past the goal: "x5" is the goal plus five
 * minutes. One for each of the essentials' rungs, since the battery is empty
 * at the goal plus whatever the essentials used.
 */
export function overRungs(goalMinutes: number): Checkpoint[] {
  return KEPT_MINUTES.map((m) => ({ id: `x${m}`, minutes: goalMinutes + m, effect: 'tick' as const }));
}

/**
 * The most the essentials can have used when their latest report is for
 * `known` minutes: less than the next rung. No report at all is taken as no
 * use (it could be up to the first rung, a minute). Past the last rung
 * nothing is known.
 */
export function keptCeiling(known: number): number {
  if (known <= 0) return 0;
  return KEPT_MINUTES.find((m) => m > known) ?? Number.POSITIVE_INFINITY;
}

/**
 * For this long after the day is registered the phone re-reports the day so
 * far, both timers at once and in no order. A report made then is weighed
 * against the essentials' reports as they stand once it is over, and the
 * phone locks nothing on it (the app does, when it is over: screenTime.ts).
 */
export const SETTLE_MS = 60_000;

/**
 * Whether the day's figure can be held to (a floor, reports.ts): with
 * essentials, only once the reports of the last registration are all in. For
 * a moment the everything timer's can be in without the essentials' own, and
 * the essentials' minutes look used; a floor taken then would keep them
 * counted for the rest of the day. `quietMs` is the wait after the last
 * report (checkpoints.ts, PICKS_QUIET_MS).
 */
export function figureSure(withEssentials: boolean, now: number, registeredAt: number, quietMs: number): boolean {
  return !withEssentials || now - registeredAt >= SETTLE_MS + quietMs;
}

/** The moment a report is weighed against the essentials' reports: its own, or the end of the settling after a registration. */
export function weighedAt(at: number, registeredAt: number): number {
  return registeredAt > 0 && at >= registeredAt && at <= registeredAt + SETTLE_MS ? registeredAt + SETTLE_MS : at;
}

/** The essentials' minutes known at `by`: their highest rung reported by then. */
export function keptBy(kept: readonly Mark[], by: number): number {
  return kept.reduce((most, mark) => (mark.at <= by ? Math.max(most, mark.minutes) : most), 0);
}

/**
 * The minutes known to be used: for each report of the everything timer, its
 * minutes less the most the essentials can have used by then, and the highest
 * of those. Use only goes up, so a figure true at one report is still true
 * later; the essentials' later minutes come with later minutes of everything.
 */
export function usedKnown(everything: readonly Mark[], kept: readonly Mark[], registeredAt: number): number {
  let used = 0;
  for (const mark of everything) used = Math.max(used, mark.minutes - keptCeiling(keptBy(kept, weighedAt(mark.at, registeredAt))));
  return used;
}

/**
 * What the phone is told for an action that waits on the essentials (the
 * library patch reads it): act only if the essentials can have used at most
 * `room` minutes, and not if one of `unless` has already acted today; once
 * acted, note `mark`. The lock comes first in a checkpoint's list and the
 * warnings name it in `unless`, so a checkpoint that locks does not warn too.
 */
export interface Tally {
  room: number;
  mark: 'lock' | 'warn' | 'near';
  unless: ('lock' | 'warn' | 'near')[];
}

/** Whether an action with `room` may act, with the essentials' latest report at `keptKnown` minutes. */
export function hasRoom(room: number, keptKnown: number): boolean {
  return keptCeiling(keptKnown) <= room;
}
