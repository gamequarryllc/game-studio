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

/**
 * A noted figure, and the reports it judges: only those arriving between
 * `opens` and `closes`, the few minutes after the day was last registered,
 * which is when iOS 26 sends false reports. Every other report is judged from
 * the day's start alone, because a report the phone has not sent yet is no
 * proof the time was not reached: it can hold reports back for a quarter of an
 * hour or more. (Build 72, 16 November: the 45 and 60 minute marks had not
 * come by 6:47 PM, so the app noted "at most 50", then threw out the phone's
 * real 70 and 105 minute reports at 6:58 and 7:36 as impossible. The same rule
 * told the phone not to lock before 8:52 PM.)
 */
export interface Known extends Noted {
  opens: number;
  closes: number;
}

/**
 * The guard for the latest registration, at `registeredAt`. Only a figure
 * noted before it is used: one noted after it says nothing about the reports
 * that registration brings.
 */
export function knownFor(noted: Noted | null, registeredAt: number, guardMs = GUARD_MS): Known | null {
  if (!noted || !(registeredAt > 0) || noted.at > registeredAt) return null;
  return { at: noted.at, most: noted.most, opens: registeredAt, closes: registeredAt + guardMs };
}

/**
 * Where a report that arrived at `arrivedAt` is judged from. Nobody uses more
 * minutes than have passed, so a report for N minutes cannot come sooner than
 * N minutes after the day's count began. And for a report arriving just after
 * the day was registered again (see `Known`), once the app has known that at
 * most `most` minutes were used by `at`, the report cannot be for more than
 * `most` plus the time since: as if the count had begun `most` minutes before
 * `at`. That is what keeps a false report from passing for real when counting
 * is set up in the middle of a day: after a change to the settings, after
 * counting is turned back on, after Screen Time access comes back.
 */
export function judgedFrom(dayStart: Date, known: Known | null, arrivedAt: Date): Date {
  if (!known || known.at < dayStart.getTime() || arrivedAt.getTime() < known.opens || arrivedAt.getTime() > known.closes) return dayStart;
  return new Date(Math.max(dayStart.getTime(), known.at - known.most * 60000));
}

/** Where reports arriving while the guard is open are judged from, for the phone's "never before" times. */
export function guardFrom(dayStart: Date, known: Known | null): Date {
  if (!known || known.at < dayStart.getTime()) return dayStart;
  return new Date(Math.max(dayStart.getTime(), known.at - known.most * 60000));
}

/** A report from today's count that can be true. */
export function believable(checkpoint: Checkpoint, dayStart: Date, known: Known | null, arrivedAt: Date): boolean {
  return arrivedAt.getTime() >= dayStart.getTime() && isPlausible(checkpoint, judgedFrom(dayStart, known, arrivedAt), arrivedAt);
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

/**
 * Whether the phone has miscounted the day: one of the day's own checkpoints
 * (a cell, the warning, empty) was reported in the current count, but too soon
 * to be true. It has then been thrown away and will not be reported again
 * today, so that part of the day cannot lock. The fix is to count again.
 */
export function miscounted(reports: readonly { id: string; at: Date }[], goalMinutes: number, dayStart: Date, known: Known | null = null): boolean {
  const own = new Map(checkpointsFor(goalMinutes).map((c) => [c.id, c]));
  return reports.some((r) => {
    const checkpoint = own.get(r.id);
    return checkpoint !== undefined && r.at.getTime() >= dayStart.getTime() && !believable(checkpoint, dayStart, known, r.at);
  });
}

/** The minutes known to be used, given the checkpoints that have plausibly arrived. */
export function usedFloor(arrived: readonly Checkpoint[]): number {
  return arrived.reduce((most, c) => Math.max(most, c.minutes), 0);
}
