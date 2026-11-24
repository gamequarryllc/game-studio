/**
 * Reading the phone's reports: which of them count towards today, and which
 * cannot be true. Every place that reads reports (the battery, the health
 * check, Count again, the test build's readout) goes through here, so they
 * cannot disagree about a report.
 */

import { believable, checkpointsFor, minuteTicksFor, picksSettled, roundName, splitName, usedFloor, type Checkpoint, type Guard, type Mark, type Pace } from './checkpoints';

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

/** The latest report under `name`, or null. */
function latestOf(reports: readonly Report[], name: string): Report | null {
  return reports.filter((r) => r.name === name).reduce<Report | null>((best, r) => (best && best.at >= r.at ? best : r), null);
}

/**
 * Today's reports in one round, each with the minutes it stands for: what
 * every report is paced against (`keepsPace`). The cells and the minute
 * checkpoints alike, from the day's start to its end.
 */
export function marksOf(reports: readonly Report[], goalMinutes: number, round: string, dayStart: number, periodEnd = Number.POSITIVE_INFINITY): Mark[] {
  const out: Mark[] = [];
  for (const checkpoint of [...checkpointsFor(goalMinutes), ...minuteTicksFor(goalMinutes)]) {
    const latest = latestOf(reports, roundName(checkpoint.id, round));
    if (latest && latest.at >= dayStart && latest.at < periodEnd) out.push({ minutes: checkpoint.minutes, at: latest.at });
  }
  return out;
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
  /** When the day was last registered (0 if not known): reports just after it are no use for pacing. */
  registeredAt?: number;
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
  const pace: Pace = { earlier: marksOf(reports, goal, round, input.dayStart, to), registeredAt: input.registeredAt ?? 0 };
  const arrived = [...checkpointsFor(goal), ...minuteTicksFor(goal)].filter((checkpoint) => {
    const latest = latestOf(reports, roundName(checkpoint.id, round));
    return latest !== null && latest.at < to && believable(checkpoint, from, guard, new Date(latest.at), pace);
  });
  return usedFloor(arrived);
}

/**
 * The day's own checkpoints (the cells, the warnings, empty) reported under
 * `round` in today's count that cannot be true: too soon after the day began,
 * or too soon after an earlier report (`keepsPace`). The phone has acted on
 * none of them (it was told not to before they could be true) and will not
 * report them again today, so that part of the day cannot lock until counting
 * is set up again (Count again, which the app also does by itself once a day).
 */
export function doubtful(reports: readonly Report[], goalMinutes: number, round: string, dayStart: Date, guard: Guard | null, registeredAt = 0): Report[] {
  const own = new Map<string, Checkpoint>(checkpointsFor(goalMinutes).map((c) => [c.id, c]));
  const pace: Pace = { earlier: marksOf(reports, goalMinutes, round, dayStart.getTime()), registeredAt };
  return reports.filter((r) => {
    const { id, round: madeIn } = splitName(r.name);
    const checkpoint = own.get(id);
    return madeIn === round && checkpoint !== undefined && r.at >= dayStart.getTime() && !believable(checkpoint, dayStart, guard, new Date(r.at), pace);
  });
}

/** Whether the phone has miscounted the day: one of its own checkpoints came too soon to be true (see `doubtful`). */
export function miscounted(reports: readonly Report[], goalMinutes: number, round: string, dayStart: Date, guard: Guard | null, registeredAt = 0): boolean {
  return doubtful(reports, goalMinutes, round, dayStart, guard, registeredAt).length > 0;
}
