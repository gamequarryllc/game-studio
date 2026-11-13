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
 * Whether the phone has miscounted the day: one of the day's own checkpoints
 * (a cell, the warning, empty) was reported in the current count, but too soon
 * to be true. It has then been thrown away and will not be reported again
 * today, so that part of the day cannot lock. The fix is to start counting
 * again.
 */
export function miscounted(reports: readonly { id: string; at: Date }[], goalMinutes: number, countFrom: Date): boolean {
  const own = new Map(checkpointsFor(goalMinutes).map((c) => [c.id, c]));
  return reports.some((r) => {
    const checkpoint = own.get(r.id);
    return checkpoint !== undefined && r.at.getTime() >= countFrom.getTime() && !isPlausible(checkpoint, countFrom, r.at);
  });
}

/** The minutes known to be used, given the checkpoints that have plausibly arrived. */
export function usedFloor(arrived: readonly Checkpoint[]): number {
  return arrived.reduce((most, c) => Math.max(most, c.minutes), 0);
}
