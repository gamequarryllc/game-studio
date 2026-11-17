/**
 * Reading the phone's reports: which of them count towards today, and which
 * cannot be true. Every place that reads reports (the battery, the health
 * check, Count again, the test build's readout) goes through here, so they
 * cannot disagree about a report.
 */

import { believable, checkpointsFor, minuteTicksFor, picksSettled, roundName, splitName, usedFloor, type Checkpoint, type Guard } from './checkpoints';

/** A report as the phone keeps it: the checkpoint's registered name (with its round) and when it came. */
export interface Report {
  name: string;
  at: number;
}

/** What is known about the day's registrations, read from the phone's saved values. */
export interface Rounds {
  /** The round the day is registered under now, and the one before it (see `roundName`). */
  round: string;
  roundBefore: string;
  /** The goal the round before was registered with: a cell's minutes depend on it. */
  goalBefore: number;
  /** When the ticked apps last changed, which starts a new round. */
  picksChangedAt: number;
}

/**
 * Whether the phone has finished reporting the day for the current round
 * (`picksSettled`). Just after the ticked apps change it hasn't, and the
 * figure is still the previous round's.
 */
export function roundSettled(reports: readonly Report[], rounds: Rounds, dayStart: number, now: number): boolean {
  if (rounds.picksChangedAt < dayStart) return true;
  const fresh = reports.filter((r) => splitName(r.name).round === rounds.round).map((r) => r.at);
  return picksSettled(now, rounds.picksChangedAt, fresh.length > 0 ? Math.max(...fresh) : null);
}

/**
 * The minutes known to be used, from the checkpoints the phone has reported
 * in the day's count: the latest report for each, if it can be true. Only one
 * round's reports count. Just after the ticked apps change, the old round's
 * figure stands until the phone has re-reported the day for the new list. A
 * finished day (`periodEnd`) is closed from the round it ended in.
 */
export function countDay(input: {
  reports: readonly Report[];
  goalMinutes: number;
  dayStart: number;
  periodEnd?: number;
  rounds: Rounds;
  guard: Guard | null;
  now: number;
}): number {
  const { reports, rounds, guard } = input;
  const from = new Date(input.dayStart);
  const to = input.periodEnd ?? Number.POSITIVE_INFINITY;
  let goal = input.goalMinutes;
  let round = rounds.round;
  if (input.periodEnd === undefined && !roundSettled(reports, rounds, input.dayStart, input.now)) {
    round = rounds.roundBefore;
    goal = rounds.goalBefore || input.goalMinutes;
  }
  const arrived = [...checkpointsFor(goal), ...minuteTicksFor(goal)].filter((checkpoint) => {
    const name = roundName(checkpoint.id, round);
    const latest = reports.filter((r) => r.name === name).reduce<Report | null>((best, r) => (best && best.at >= r.at ? best : r), null);
    return latest !== null && latest.at < to && believable(checkpoint, from, guard, new Date(latest.at));
  });
  return usedFloor(arrived);
}

/**
 * The day's own checkpoints (the cells, the warnings, empty) reported under
 * `round` in today's count that cannot be true. The phone has acted on none of
 * them (it was told not to before they could be true) and will not report
 * them again today, so that part of the day cannot lock until counting is set
 * up again.
 */
export function doubtful(reports: readonly Report[], goalMinutes: number, round: string, dayStart: Date, guard: Guard | null): Report[] {
  const own = new Map<string, Checkpoint>(checkpointsFor(goalMinutes).map((c) => [c.id, c]));
  return reports.filter((r) => {
    const { id, round: madeIn } = splitName(r.name);
    const checkpoint = own.get(id);
    return madeIn === round && checkpoint !== undefined && r.at >= dayStart.getTime() && !believable(checkpoint, dayStart, guard, new Date(r.at));
  });
}

/** Whether the phone has miscounted the day: one of its own checkpoints came too soon to be true (see `doubtful`). */
export function miscounted(reports: readonly Report[], goalMinutes: number, round: string, dayStart: Date, guard: Guard | null): boolean {
  return doubtful(reports, goalMinutes, round, dayStart, guard).length > 0;
}
