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
 * The most that can have been used by `at`, in minutes: something the app
 * learned while counting was working (see `mostByNow`). Kept on the phone, so
 * it outlives counting being turned off, Screen Time access being taken away,
 * or the day being registered again after a change to the settings.
 */
export interface Known {
  at: number;
  most: number;
}

/**
 * Where a report that arrived at `arrivedAt` is judged from. Nobody uses more
 * minutes than have passed, so a report for N minutes cannot come sooner than
 * N minutes after the day's count began. And once the app has known that at
 * most `most` minutes were used by `at`, a report arriving after `at` cannot be
 * for more than `most` plus the time since: as if the count had begun `most`
 * minutes before `at`. That is what keeps a false report from the phone (iOS
 * 26 sends them right after counting is set up) from passing for real when
 * counting is set up in the middle of a day: after a change to the settings,
 * after counting is turned back on, after Screen Time access comes back.
 */
export function judgedFrom(dayStart: Date, known: Known | null, arrivedAt: Date): Date {
  if (!known || known.at < dayStart.getTime() || arrivedAt.getTime() < known.at) return dayStart;
  return new Date(Math.max(dayStart.getTime(), known.at - known.most * 60000));
}

/** Where every report from now on is judged from, for the phone's "never before" times. */
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
 * Five minutes are added for the phone being slow to report. Nothing is known
 * once the goal is passed, as there are no checkpoints beyond it.
 */
export function mostByNow(goalMinutes: number, usedFloorNow: number, slackMinutes = 5): number | null {
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
