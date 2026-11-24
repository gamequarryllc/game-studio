// The phone does not tell an app how many minutes have been used. An app can
// only ask to be told when a total is reached. These are the totals this app
// asks about, and the checks that keep a wrong answer off the home screen.

import { CELLS } from './battery';

export interface Checkpoint {
  id: string;
  /** Minutes of use at which the phone should speak up. */
  minutes: number;
  /** What changes when it does. A tick changes nothing but the minutes shown. */
  effect: 'cell' | 'warning' | 'empty' | 'tick';
}

/**
 * One checkpoint per cell. The fifth (one cell left) and a last one shortly
 * before the end also bring up the warning screen; the sixth is "empty".
 */
export function checkpointsFor(goalMinutes: number): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (let k = 1; k < CELLS; k++) {
    out.push({ id: `cell-${k}`, minutes: (goalMinutes * k) / CELLS, effect: k === CELLS - 1 ? 'warning' : 'cell' });
  }
  out.push({ id: 'final-warning', minutes: goalMinutes - finalWarningMinutes(goalMinutes), effect: 'warning' });
  out.push({ id: 'empty', minutes: goalMinutes, effect: 'empty' });
  return out.sort((a, b) => a.minutes - b.minutes);
}

/**
 * How far apart the minute checkpoints are: about eighteen to a day, in whole
 * five minutes, never closer than five. Ten minutes on a 3-hour day.
 */
export function tickStepMinutes(goalMinutes: number): number {
  return Math.max(5, Math.ceil(goalMinutes / 18 / 5) * 5);
}

/**
 * Checkpoints between the cells, so the minutes on Today move in small steps
 * instead of a cell at a time. They lock nothing and are registered apart from
 * the day's own checkpoints: if the phone ever tires of so many, it is these it
 * stops reporting, not the ones that lock. Any that fall on a cell's checkpoint
 * are left out.
 */
export function minuteTicksFor(goalMinutes: number): Checkpoint[] {
  const step = tickStepMinutes(goalMinutes);
  const taken = checkpointsFor(goalMinutes).map((c) => c.minutes);
  const out: Checkpoint[] = [];
  for (let m = step; m < goalMinutes; m += step) {
    if (taken.some((t) => Math.abs(t - m) < 0.5)) continue;
    out.push({ id: `m${m}`, minutes: m, effect: 'tick' });
  }
  return out;
}

/** How long before the end the last warning comes: ten minutes on a 3-hour day, never under five. */
export function finalWarningMinutes(goalMinutes: number): number {
  return Math.max(5, Math.round(goalMinutes / 18));
}

/**
 * Whether a checkpoint can be true. Nobody can use 90 minutes of screen time
 * in the first 20 minutes after a recharge, so a checkpoint that arrives
 * sooner than its own minutes is thrown away. (The phone has been known to
 * report limits as reached the moment they are set.)
 */
export function isPlausible(checkpoint: Checkpoint, periodStart: Date, arrivedAt: Date, slackMinutes = 2): boolean {
  const elapsed = (arrivedAt.getTime() - periodStart.getTime()) / 60000;
  if (elapsed < 0) return false;
  return elapsed + slackMinutes >= checkpoint.minutes;
}

/**
 * Checkpoints are registered under a round name whenever the ticked apps
 * change ("cell-2~mhz3k1"), so a report always says which list it was made
 * for. The phone can deliver reports for the old list well after the change
 * (build 52: 38 seconds, which put Claude's minutes back after it was
 * unticked). A report from another round is never mistaken for this one.
 */
export function roundName(id: string, round: string): string {
  return round ? `${id}~${round}` : id;
}

/** The checkpoint a reported name stands for, and the round it was made in. */
export function splitName(name: string): { id: string; round: string } {
  const at = name.indexOf('~');
  return at < 0 ? { id: name, round: '' } : { id: name.slice(0, at), round: name.slice(at + 1) };
}

/**
 * Whether the phone has finished re-reporting the day for a new list: two
 * seconds after its last report for the new round, or a minute after the
 * change if it sends none (the new list may have no use yet). Until then the
 * battery keeps the old round's figure, so it doesn't show full for a moment
 * and then jump (build 52).
 */
export const PICKS_QUIET_MS = 2000;
export const PICKS_WAIT_MS = 60000;
export function picksSettled(nowMs: number, picksChangedAt: number, lastReportSince: number | null): boolean {
  if (nowMs - picksChangedAt >= PICKS_WAIT_MS) return true;
  return lastReportSince !== null && nowMs - lastReportSince >= PICKS_QUIET_MS;
}

/**
 * The most that can have been used by `at`, in minutes: something the app
 * noted while counting was working (see `mostByNow`). Kept on the phone, so
 * it outlives counting being turned off, Screen Time access being taken away,
 * or the day being registered again after a change to the settings.
 */
export interface Noted {
  at: number;
  most: number;
}

/**
 * How long after the day is registered its false reports are guarded against.
 * iOS 26 sends them within seconds of registering; this leaves room.
 */
export const GUARD_MS = 10 * 60 * 1000;

/** Where the guard for the latest registration is kept, for the app, the locks and the widget alike. */
export const GUARD_KEY = 'plainlimit_guard';

/**
 * The guard against false reports for the latest registration: a report
 * arriving between `opens` and `closes`, the few minutes after the day was
 * registered (when iOS 26 sends false ones), is judged as if the count had
 * begun at `from`. Every other report is judged from the day's start alone,
 * because a report the phone has not sent yet is no proof the time was not
 * reached: it can hold reports back for a quarter of an hour or more. (Build
 * 72, 16 November: the 45 and 60 minute marks had not come by 6:47 PM, so the
 * app noted "at most 50", then threw out the phone's real 70 and 105 minute
 * reports at 6:58 and 7:36 as impossible, and told the phone not to lock until
 * later in the evening.) Worked out once, when the day is registered, and
 * saved under `GUARD_KEY`, so the app's count, the phone's lock times and the
 * widget all judge from the same three numbers.
 */
export interface Guard {
  from: number;
  opens: number;
  closes: number;
}

/**
 * The guard for a registration at `registeredAt`, from the last noted figure:
 * as if the count had begun `most` minutes before `at`. Only a figure noted
 * before the registration and since the day's start is used: one noted after
 * it says nothing about the reports that registration brings.
 */
export function guardFor(noted: Noted | null, registeredAt: number, dayStart: Date, guardMs = GUARD_MS): Guard | null {
  if (!noted || !(registeredAt > 0) || noted.at > registeredAt || noted.at < dayStart.getTime()) return null;
  return { from: Math.max(dayStart.getTime(), noted.at - noted.most * 60000), opens: registeredAt, closes: registeredAt + guardMs };
}

/** A guard as read back from the phone, or null if it isn't one. */
export function asGuard(value: unknown): Guard | null {
  if (!value || typeof value !== 'object') return null;
  const { from, opens, closes } = value as Record<string, unknown>;
  return [from, opens, closes].every((n) => typeof n === 'number' && Number.isFinite(n)) ? { from: from as number, opens: opens as number, closes: closes as number } : null;
}

/**
 * Where a report that arrived at `arrivedAt` is judged from. Nobody uses more
 * minutes than have passed, so a report for N minutes cannot come sooner than
 * N minutes after the day's count began. A report arriving while the guard is
 * open (see `Guard`) is judged from the guard's start instead. That is what
 * keeps a false report from passing for real when counting is set up in the
 * middle of a day: after a change to the settings, after counting is turned
 * back on, after Screen Time access comes back.
 */
export function judgedFrom(dayStart: Date, guard: Guard | null, arrivedAt: Date): Date {
  if (!guard || arrivedAt.getTime() < guard.opens || arrivedAt.getTime() > guard.closes) return dayStart;
  return new Date(Math.max(dayStart.getTime(), guard.from));
}

/** Where reports arriving while the guard is open are judged from, for the phone's "never before" times. */
export function guardFrom(dayStart: Date, guard: Guard | null): Date {
  return guard ? new Date(Math.max(dayStart.getTime(), guard.from)) : dayStart;
}

/**
 * How far a report may run ahead of an earlier one before it is taken for a
 * false one: room for the phone being slow with the earlier report, the same
 * twenty minutes `mostByNow` allows.
 */
export const PACE_SLACK_MINUTES = 20;

/** A report of a checkpoint today, with the minutes it stands for: what later reports are paced against. */
export interface Mark {
  minutes: number;
  at: number;
}

/**
 * Whether an earlier report says anything about the pace of one for `minutes`
 * arriving at `arrivedAt`: it came first, it is for fewer minutes, and it did
 * not come in the minutes after the day was last registered, when the phone
 * re-reports the day so far with fresh times (a report made then was reached
 * earlier, so its time proves nothing).
 */
function pacedBy(earlier: Mark, minutes: number, arrivedAt: number, registeredAt: number): boolean {
  const reReported = registeredAt > 0 && earlier.at >= registeredAt && earlier.at <= registeredAt + GUARD_MS;
  return earlier.at < arrivedAt && earlier.minutes < minutes && !reReported;
}

/**
 * Whether a report keeps pace with the clock. Nobody uses minutes faster than
 * they pass, so a report for M minutes cannot come sooner than M - L minutes
 * after an earlier one for L, less the allowance for a slow phone. (24
 * November, build 150: the 60-minute mark came at 2:11 PM; at 2:27 the 100,
 * 113 and 120-minute marks came within two seconds of each other, with the
 * phone on its charger, and the battery emptied with 1:15 of 2:00 used. iOS 26
 * fires checkpoints for nothing at times, often when a phone is picked up or
 * plugged in. The guard after a registration could not catch it: the day had
 * been registered the evening before.) A report that came early never makes a
 * later one look too soon (it only pulls the bar earlier), so every earlier
 * report can be used; only a late one could, which is what the allowance is for.
 */
export function keepsPace(minutes: number, arrivedAt: number, earlier: readonly Mark[], registeredAt: number, slackMinutes = PACE_SLACK_MINUTES): boolean {
  return earlier.every((mark) => !pacedBy(mark, minutes, arrivedAt, registeredAt) || arrivedAt >= mark.at + (minutes - mark.minutes - slackMinutes) * 60000);
}

/**
 * The pace rule as the phone applies it, for a checkpoint's actions: for each
 * checkpoint far enough below it to matter, how long after that one's report
 * it may first act. (The monitor extension reads the reports' times as it
 * goes; src/platform/screenTime.ts writes these with the actions, and the
 * library patch in patches/ checks them.)
 */
export function paceRules<T extends { name: string; minutes: number }>(minutes: number, all: readonly T[], slackMinutes = PACE_SLACK_MINUTES): { name: string; ms: number }[] {
  return all.filter((c) => minutes - c.minutes - slackMinutes > 0).map((c) => ({ name: c.name, ms: Math.round((minutes - c.minutes - slackMinutes) * 60000) }));
}

/** What a report is paced against: the day's earlier reports, and when the day was last registered. */
export interface Pace {
  earlier: readonly Mark[];
  registeredAt: number;
}

/** A report from today's count that can be true. */
export function believable(checkpoint: Checkpoint, dayStart: Date, guard: Guard | null, arrivedAt: Date, pace: Pace | null = null): boolean {
  if (arrivedAt.getTime() < dayStart.getTime() || !isPlausible(checkpoint, judgedFrom(dayStart, guard, arrivedAt), arrivedAt)) return false;
  return pace === null || keepsPace(checkpoint.minutes, arrivedAt.getTime(), pace.earlier, pace.registeredAt);
}

/**
 * The most that can have been used right now, while counting works: less than
 * the next checkpoint that has not been reported, since it would have been.
 * Twenty minutes are added for the phone being slow to report (build 72 was
 * seen a quarter of an hour behind). Nothing is known once the goal is passed,
 * as there are no checkpoints beyond it.
 */
export function mostByNow(goalMinutes: number, usedFloorNow: number, slackMinutes = 20): number | null {
  const next = [...checkpointsFor(goalMinutes), ...minuteTicksFor(goalMinutes)]
    .map((c) => c.minutes)
    .filter((m) => m > usedFloorNow)
    .sort((a, b) => a - b)[0];
  return next === undefined ? null : next + slackMinutes;
}

/** The minutes known to be used, given the checkpoints that have plausibly arrived. */
export function usedFloor(arrived: readonly Checkpoint[]): number {
  return arrived.reduce((most, c) => Math.max(most, c.minutes), 0);
}
