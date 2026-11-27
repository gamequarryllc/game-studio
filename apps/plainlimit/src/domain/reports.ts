/**
 * Reading the phone's reports: which of them count towards today, and which
 * cannot be true. Every place that reads reports (the battery, the health
 * check, Count again, the test build's readout) goes through here, so they
 * cannot disagree about a report.
 */

import { PICKS_WAIT_MS, believable, checkpointsFor, minuteTicksFor, picksSettled, roundName, splitName, type Checkpoint, type Guard, type Mark, type Pace } from './checkpoints';
import { keptRungs, overRungs, usedKnown } from './tally';

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
  /** Whether the day is registered with essentials, whose own timer reports beside the everything timer (tally.ts). */
  kept?: boolean;
}

/**
 * Whether the phone has finished reporting the day for the current round
 * (`picksSettled`). Just after the ticked apps change it hasn't, and the
 * figure is still the previous round's.
 * With essentials the day comes as two sets of reports, the everything
 * timer's and the essentials' own, in no order. With only the first in, the
 * essentials' minutes would look used. So the round is not settled until an
 * essentials' report is in too, or a minute has passed with none (they used
 * nothing today).
 */
export function roundSettled(reports: readonly Report[], rounds: Rounds, dayStart: number, now: number): boolean {
  if (rounds.picksChangedAt < dayStart) return true;
  const fresh = reports.filter((r) => splitName(r.name).round === rounds.round);
  if (rounds.kept === true && now - rounds.picksChangedAt < PICKS_WAIT_MS) {
    const rungs = new Set(keptRungs().map((rung) => rung.id));
    if (!fresh.some((r) => rungs.has(splitName(r.name).id))) return false;
  }
  const times = fresh.map((r) => r.at);
  return picksSettled(now, rounds.picksChangedAt, times.length > 0 ? Math.max(...times) : null);
}

/**
 * The round whose reports a new round leaves standing, to count from while
 * the phone re-reports the day: the one ending, unless the phone has reported
 * nothing for it yet (it began moments ago, or the phone is slow to re-report
 * after a registration). Then the round before it still holds the day's
 * figure. Two changes in a row (build 154: the goal lowered twice) used to
 * throw that figure away, and the battery showed full until the phone had
 * re-reported the day.
 */
export function roundStanding(reportedRounds: ReadonlySet<string>, ending: string, before: string): string {
  return !reportedRounds.has(ending) && reportedRounds.has(before) ? before : ending;
}

/**
 * The minutes known to be used when the goal changed, for the round
 * registered with the new goal. Only the goal changed (the same apps, the
 * same day), so the day's use cannot be less than that, whatever the phone
 * has re-reported so far. A change of picks or of recharge time sets none: it
 * can honestly take minutes off.
 */
export interface Floor {
  round: string;
  dayStart: number;
  minutes: number;
}

/** `count`, but never under a floor set for this round on this day. */
export function withFloor(count: number, floor: Floor | null, round: string, dayStart: number): number {
  return floor !== null && floor.round === round && floor.dayStart === dayStart ? Math.max(count, floor.minutes) : count;
}

/** The latest report under `name`, or null. */
function latestOf(reports: readonly Report[], name: string): Report | null {
  return reports.filter((r) => r.name === name).reduce<Report | null>((best, r) => (best && best.at >= r.at ? best : r), null);
}

/** Every checkpoint of the everything timer: the cells, the minute ones, and its rungs past the goal (registered only with essentials; tally.ts). */
function everythingCheckpoints(goalMinutes: number): Checkpoint[] {
  return [...checkpointsFor(goalMinutes), ...minuteTicksFor(goalMinutes), ...overRungs(goalMinutes)];
}

/** Today's reports of `checkpoints` in one round, each with the minutes it stands for. */
function marksIn(checkpoints: readonly Checkpoint[], reports: readonly Report[], round: string, dayStart: number, periodEnd: number): Mark[] {
  const out: Mark[] = [];
  for (const checkpoint of checkpoints) {
    const latest = latestOf(reports, roundName(checkpoint.id, round));
    if (latest && latest.at >= dayStart && latest.at < periodEnd) out.push({ minutes: checkpoint.minutes, at: latest.at });
  }
  return out;
}

/**
 * Today's reports of the everything timer in one round, each with the minutes
 * it stands for: what every report is paced against (`keepsPace`). The cells,
 * the minute checkpoints and the rungs past the goal alike, from the day's
 * start to its end.
 */
export function marksOf(reports: readonly Report[], goalMinutes: number, round: string, dayStart: number, periodEnd = Number.POSITIVE_INFINITY): Mark[] {
  return marksIn(everythingCheckpoints(goalMinutes), reports, round, dayStart, periodEnd);
}

/** The same for the essentials' own timer (tally.ts): its reports are paced against each other. */
export function keptMarksOf(reports: readonly Report[], round: string, dayStart: number, periodEnd = Number.POSITIVE_INFINITY): Mark[] {
  return marksIn(keptRungs(), reports, round, dayStart, periodEnd);
}

/** What `readDay` is given: the phone's reports and what is saved about the day's registrations. */
export interface DayInput {
  reports: readonly Report[];
  goalMinutes: number;
  dayStart: number;
  periodEnd?: number;
  rounds: Rounds;
  guard: Guard | null;
  now: number;
  /** When the day was last registered (0 if not known): reports just after it are no use for pacing. */
  registeredAt?: number;
}

/** The day as the phone has reported it: the reports of each timer that can be true, and the goal they were registered with. */
export interface DayRead {
  goalMinutes: number;
  everything: Mark[];
  kept: Mark[];
  registeredAt: number;
}

/**
 * The reports that count towards today: the latest for each checkpoint, if it
 * can be true. Only one round's reports count. Just after the essentials
 * change, the old round's reports stand until the phone has re-reported the
 * day for the new list. A finished day (`periodEnd`) is closed from the round
 * it ended in.
 */
export function readDay(input: DayInput): DayRead {
  const { reports, rounds, guard } = input;
  const from = new Date(input.dayStart);
  const to = input.periodEnd ?? Number.POSITIVE_INFINITY;
  const registeredAt = input.registeredAt ?? 0;
  let goal = input.goalMinutes;
  let round = rounds.round;
  if (input.periodEnd === undefined && !roundSettled(reports, rounds, input.dayStart, input.now)) {
    round = rounds.roundBefore;
    goal = rounds.goalBefore || input.goalMinutes;
  }
  const arrived = (checkpoints: readonly Checkpoint[], pace: Pace): Mark[] =>
    checkpoints.flatMap((checkpoint) => {
      const latest = latestOf(reports, roundName(checkpoint.id, round));
      return latest !== null && latest.at < to && believable(checkpoint, from, guard, new Date(latest.at), pace) ? [{ minutes: checkpoint.minutes, at: latest.at }] : [];
    });
  return {
    goalMinutes: goal,
    everything: arrived(everythingCheckpoints(goal), { earlier: marksOf(reports, goal, round, input.dayStart, to), registeredAt }),
    kept: arrived(keptRungs(), { earlier: keptMarksOf(reports, round, input.dayStart, to), registeredAt }),
    registeredAt,
  };
}

/**
 * The minutes known to be used: everything, less the essentials (tally.ts).
 * With no essentials that is the everything timer's highest checkpoint, as
 * the count always was. It stops at the goal, as it always did: past it the
 * battery is empty, and only essentials (and whatever iOS never locks) go on.
 */
export function countDay(input: DayInput): number {
  const day = readDay(input);
  return Math.min(day.goalMinutes, usedKnown(day.everything, day.kept, day.registeredAt));
}

/** The most the everything timer has reported today: what the guard after a registration is worked out from (`mostByNow`). */
export function everythingCounted(input: DayInput): number {
  return readDay(input).everything.reduce((most, mark) => Math.max(most, mark.minutes), 0);
}

/** The most the essentials' timer has reported today, for the readout. */
export function keptCounted(input: DayInput): number {
  return readDay(input).kept.reduce((most, mark) => Math.max(most, mark.minutes), 0);
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
