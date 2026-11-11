// The phone does not tell an app how many minutes have been used. An app can
// only ask to be told when a total is reached. These are the totals this app
// asks about, and the checks that keep a wrong answer off the home screen.

import { CELLS } from './battery';

export interface Checkpoint {
  id: string;
  /** Minutes of use at which the phone should speak up. */
  minutes: number;
  /** What changes when it does. */
  effect: 'cell' | 'warning' | 'empty';
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

/** The minutes known to be used, given the checkpoints that have plausibly arrived. */
export function usedFloor(arrived: readonly Checkpoint[]): number {
  return arrived.reduce((most, c) => Math.max(most, c.minutes), 0);
}
