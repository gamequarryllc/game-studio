import { checkpointsFor, minuteTicksFor, roundName, type Mark } from '../checkpoints';
import { monitorPlan, type PlanAction, type PlanEvent } from '../monitorPlan';
import { countDay, everythingCounted, keptCounted, type Report, type Rounds } from '../reports';
import { DEFAULT_SETTINGS } from '../settings';
import { KEPT_ACTIVITY, KEPT_MINUTES, OVER_ACTIVITY, SETTLE_MS, figureSure, hasRoom, keptBy, keptCeiling, keptRungs, overRungs, usedKnown, weighedAt } from '../tally';
import type { Settings } from '../types';

// Counting everything, less the essentials (tally.ts): the rule itself, and
// whole days replayed minute by minute against it, as the app reads them and
// as the phone locks on them. What cannot be checked here is the phone: that
// a timer with no apps counts everything, and that its two timers stay in
// step. NOTES.md keeps what each build showed.

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, allowed: [...DEFAULT_SETTINGS.allowed], ...over });
const MIN = 60_000;

describe("the essentials' rungs", () => {
  it('are every minute to five, every five to two hours, then wider, to twelve hours', () => {
    expect(KEPT_MINUTES.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 10, 15, 20]);
    expect(KEPT_MINUTES).toContain(120);
    expect(KEPT_MINUTES).toContain(135);
    expect(KEPT_MINUTES[KEPT_MINUTES.length - 1]).toBe(720);
    expect([...KEPT_MINUTES].sort((a, b) => a - b)).toEqual([...KEPT_MINUTES]);
    expect(new Set(KEPT_MINUTES).size).toBe(KEPT_MINUTES.length);
    // As many as one registration is trusted with.
    expect(KEPT_MINUTES.length).toBe(48);
  });

  it('are registered under names of their own, which the phone can tell from the day\'s', () => {
    expect(keptRungs().map((k) => k.id).slice(0, 3)).toEqual(['k1', 'k2', 'k3']);
    expect(overRungs(120).slice(0, 2)).toEqual([
      { id: 'x1', minutes: 121, effect: 'tick' },
      { id: 'x2', minutes: 122, effect: 'tick' },
    ]);
    // The library splits its keys on "_".
    for (const name of [KEPT_ACTIVITY, OVER_ACTIVITY]) expect(name).not.toContain('_');
    const day = [...checkpointsFor(120), ...minuteTicksFor(120)].map((c) => c.id);
    for (const rung of [...keptRungs(), ...overRungs(120)]) expect(day).not.toContain(rung.id);
  });

  it('one rung past the goal for each of the essentials\' rungs', () => {
    expect(overRungs(180).map((x) => x.minutes - 180)).toEqual([...KEPT_MINUTES]);
  });
});

describe('the most the essentials can have used', () => {
  it('is anything short of their next rung', () => {
    expect(keptCeiling(1)).toBe(2);
    expect(keptCeiling(5)).toBe(10);
    expect(keptCeiling(120)).toBe(135);
    expect(keptCeiling(660)).toBe(720);
  });

  it('is nothing with no report, and unknown past the last rung', () => {
    expect(keptCeiling(0)).toBe(0);
    expect(keptCeiling(720)).toBe(Number.POSITIVE_INFINITY);
  });

  it('leaves room for an action only up to that', () => {
    // The lock at the goal itself has no room: any report of the essentials holds it back.
    expect(hasRoom(0, 0)).toBe(true);
    expect(hasRoom(0, 1)).toBe(false);
    // Ten minutes past the goal, with the essentials last heard of at five: they can have used up to ten.
    expect(hasRoom(10, 5)).toBe(true);
    expect(hasRoom(5, 5)).toBe(false);
    expect(hasRoom(9999, 720)).toBe(false);
  });
});

describe('the minutes known to be used', () => {
  const at = (minute: number) => Date.UTC(2026, 10, 27, 12, 0) + minute * MIN;
  const mark = (minutes: number, minute: number): Mark => ({ minutes, at: at(minute) });

  it('a figure read while the day is still being re-reported is not held to: two hours of an essential must not come back as use', () => {
    // Two hours in Maps, an essential, and 40 minutes of everything else. The day is registered again at minute 300
    // and the phone re-reports it: the everything timer's 160 arrives a moment before the essentials' 120.
    const registered = at(300);
    const everything = [mark(160, 300.05)];
    // Read in that moment, the essentials' minutes look used. This is the figure that must not be kept as a floor.
    expect(usedKnown(everything, [], registered)).toBe(160);
    expect(figureSure(true, at(300.06), registered, 2000)).toBe(false);
    expect(figureSure(true, registered + SETTLE_MS + 1999, registered, 2000)).toBe(false);
    // Once the settling is over the essentials' reports are in, and the figure is the one to hold to.
    expect(figureSure(true, registered + SETTLE_MS + 2000, registered, 2000)).toBe(true);
    expect(usedKnown(everything, [mark(120, 300.07)], registered)).toBe(25);
    // With no essentials there is one timer and nothing to wait for.
    expect(figureSure(false, at(300.06), registered, 2000)).toBe(true);
  });

  it('with no essentials is the everything timer\'s highest report, as the count always was', () => {
    expect(usedKnown([mark(20, 30), mark(60, 90), mark(40, 50)], [], 0)).toBe(60);
    expect(usedKnown([], [], 0)).toBe(0);
  });

  it('takes off the most the essentials can have used by each report, and keeps the highest', () => {
    // 60 of everything at 90 with the essentials at 15 (so under 20): at least 40 used.
    expect(usedKnown([mark(60, 90)], [mark(15, 80)], 0)).toBe(40);
    // The essentials' later minutes come with later minutes of everything: the figure never goes down.
    const everything = [mark(60, 90), mark(70, 200)];
    const kept = [mark(15, 80), mark(25, 190)];
    expect(usedKnown(everything, kept, 0)).toBe(40);
    expect(usedKnown([...everything, mark(90, 230)], kept, 0)).toBe(60);
  });

  it('never weighs a report against essentials heard of after it', () => {
    expect(keptBy([mark(15, 80), mark(25, 190)], at(100))).toBe(15);
    expect(usedKnown([mark(60, 90)], [mark(15, 80), mark(120, 300)], 0)).toBe(40);
  });

  it('is never below zero, nor known past the essentials\' last rung', () => {
    expect(usedKnown([mark(10, 20)], [mark(60, 15)], 0)).toBe(0);
    expect(usedKnown([mark(900, 950)], [mark(720, 940)], 0)).toBe(0);
  });

  it('weighs reports in the settling after a registration against the essentials as they stand when it is over', () => {
    const registered = at(100);
    expect(weighedAt(registered + 5000, registered)).toBe(registered + SETTLE_MS);
    expect(weighedAt(registered + SETTLE_MS + 1, registered)).toBe(registered + SETTLE_MS + 1);
    expect(weighedAt(registered - 1, registered)).toBe(registered - 1);
    expect(weighedAt(at(5), 0)).toBe(at(5));
    // The phone re-reports the day: everything first, the essentials seconds later. The order makes no difference.
    const everything = [{ minutes: 150, at: registered + 2000 }];
    const keptLate = [{ minutes: 60, at: registered + 9000 }];
    const keptEarly = [{ minutes: 60, at: registered + 1000 }];
    expect(usedKnown(everything, keptLate, registered)).toBe(usedKnown(everything, keptEarly, registered));
    expect(usedKnown(everything, keptLate, registered)).toBe(85);
    // Without the settling the 150 would have counted in full for those seconds: an empty battery out of nothing.
    expect(usedKnown(everything, keptLate, 0)).toBe(150);
  });
});

/** One minute of a replayed day: in an essential, in anything else, or the phone put down. */
type Use = 'kept' | 'other' | 'idle';

/** A day's use, a minute at a time, from a seed: stretches of each kind, a few minutes to most of an hour long. */
function dayOf(seed: number, minutes: number, keptShare: number): Use[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const out: Use[] = [];
  while (out.length < minutes) {
    const roll = next();
    const kind: Use = roll < 0.3 ? 'idle' : roll < 0.3 + keptShare ? 'kept' : 'other';
    const run = 1 + Math.floor(next() * 40);
    for (let i = 0; i < run && out.length < minutes; i++) out.push(kind);
  }
  return out;
}

/**
 * Replays a day against the plan handed to the phone: the phone reports each
 * checkpoint of either timer in the minute it is reached, and acts on a
 * tallied action as the monitor extension does (the library patch,
 * plainlimitTally): only with room, and not if one of `unless` has acted.
 * Returns what the app read after each minute and when the phone locked.
 */
function replay(use: readonly Use[], goal: number) {
  const plan = monitorPlan(settings({ goalMinutes: goal }), 0, null, true);
  const start = new Date(2026, 10, 27, 6, 0).getTime();
  const rounds: Rounds = { round: 'r', roundBefore: '', goalBefore: 0, picksChangedAt: 0 };
  const reports: Report[] = [];
  const done = new Set<string>();
  const acted: { mark: string; minute: number; everything: number; kept: number }[] = [];
  const everythingEvents: PlanEvent[] = [...plan.events, ...plan.ticks, ...plan.over].sort((a, b) => a.minutes - b.minutes);
  let everything = 0;
  let kept = 0;
  let keptKnown = 0;
  const read: { used: number; trueUsed: number; kept: number }[] = [];
  use.forEach((kind, i) => {
    const at = start + (i + 1) * MIN;
    const before = { everything, kept };
    if (kind !== 'idle') everything += 1;
    if (kind === 'kept') kept += 1;
    // The essentials' rung first when both fall in the same minute, as its time is the earlier one.
    for (const rung of plan.kept) {
      if (rung.minutes > before.kept && rung.minutes <= kept) {
        reports.push({ name: roundName(rung.name, 'r'), at: at - 1 });
        keptKnown = Math.max(keptKnown, rung.minutes);
      }
    }
    for (const event of everythingEvents) {
      if (!(event.minutes > before.everything && event.minutes <= everything)) continue;
      for (const action of event.actions as PlanAction[]) {
        const tally = action.tally;
        if (!tally) throw new Error('with essentials every action waits on them');
        if (tally.unless.some((m) => done.has(m)) || !hasRoom(tally.room, keptKnown)) continue;
        done.add(tally.mark);
        acted.push({ mark: tally.mark, minute: i + 1, everything, kept });
      }
      reports.push({ name: roundName(event.name, 'r'), at });
    }
    const used = countDay({ reports, goalMinutes: goal, dayStart: start, rounds, guard: null, now: at });
    read.push({ used, trueUsed: everything - kept, kept });
  });
  const input = { reports, goalMinutes: goal, dayStart: start, rounds, guard: null, now: start + use.length * MIN };
  return { read, acted, everythingCounted: everythingCounted(input), keptCounted: keptCounted(input), everything, kept };
}

/** How far apart the essentials' rungs are at `minutes`: how late a lock can land. */
function stepAt(minutes: number): number {
  const above = keptCeiling(Math.max(1, minutes));
  const below = [...KEPT_MINUTES].reverse().find((m) => m <= minutes) ?? 0;
  return above - below;
}

describe('whole days, replayed', () => {
  const days = [
    { seed: 7, goal: 120, share: 0.25 },
    { seed: 21, goal: 180, share: 0.4 },
    { seed: 99, goal: 60, share: 0.1 },
    { seed: 1234, goal: 150, share: 0.55 },
    { seed: 5, goal: 90, share: 0.0 },
    { seed: 4242, goal: 240, share: 0.3 },
    { seed: 31337, goal: 45, share: 0.6 },
  ];

  it('the figure never says more was used than was, and never goes down', () => {
    for (const { seed, goal, share } of days) {
      const { read } = replay(dayOf(seed, 16 * 60, share), goal);
      let last = 0;
      for (const minute of read) {
        expect(minute.used).toBeLessThanOrEqual(Math.min(goal, minute.trueUsed));
        expect(minute.used).toBeGreaterThanOrEqual(last);
        last = minute.used;
      }
    }
  });

  it('the phone locks in the very minute the app\'s figure reaches the goal: never before the goal is used, and at most one rung of the essentials late', () => {
    let locked = 0;
    for (const { seed, goal, share } of days) {
      const { read, acted } = replay(dayOf(seed, 16 * 60, share), goal);
      const lock = acted.find((a) => a.mark === 'lock');
      const emptyAt = read.findIndex((minute) => minute.used >= goal) + 1;
      expect(lock?.minute ?? 0).toBe(emptyAt);
      if (!lock) continue;
      locked += 1;
      const trueUsed = lock.everything - lock.kept;
      expect(trueUsed).toBeGreaterThanOrEqual(goal);
      expect(trueUsed - goal).toBeLessThanOrEqual(stepAt(lock.kept));
      // Once, however many rungs come after it.
      expect(acted.filter((a) => a.mark === 'lock')).toHaveLength(1);
    }
    expect(locked).toBeGreaterThanOrEqual(5);
  });

  it('the warning and "Nearly out" come once each, before the lock and never after it', () => {
    for (const { seed, goal, share } of days) {
      const { acted } = replay(dayOf(seed, 16 * 60, share), goal);
      const lock = acted.find((a) => a.mark === 'lock');
      for (const mark of ['warn', 'near']) {
        const these = acted.filter((a) => a.mark === mark);
        expect(these.length).toBeLessThanOrEqual(1);
        if (lock && these.length > 0) expect(these[0].minute).toBeLessThanOrEqual(lock.minute);
        // Not before that much is really used.
        const from = mark === 'warn' ? (goal * 5) / 6 : goal - Math.max(5, Math.round(goal / 18));
        if (these.length > 0) expect(these[0].everything - these[0].kept).toBeGreaterThanOrEqual(from);
      }
    }
  });

  it('a day with no use of the essentials is the day as it always was: locked at the goal exactly', () => {
    const { read, acted, keptCounted: keptSeen } = replay(dayOf(5, 16 * 60, 0), 90);
    expect(keptSeen).toBe(0);
    const lock = acted.find((a) => a.mark === 'lock');
    expect(lock?.everything).toBe(90);
    expect(read[read.length - 1].used).toBe(90);
  });

  it('a day spent mostly in the essentials does not lock on their minutes', () => {
    // Four hours of essentials, half an hour of anything else, on a two-hour goal.
    const use: Use[] = [...Array<Use>(240).fill('kept'), ...Array<Use>(30).fill('other')];
    const { read, acted, everythingCounted: seen, keptCounted: keptSeen } = replay(use, 120);
    expect(acted.find((a) => a.mark === 'lock')).toBeUndefined();
    expect(seen).toBeGreaterThanOrEqual(240);
    expect(keptSeen).toBe(240);
    const end = read[read.length - 1];
    expect(end.used).toBeLessThanOrEqual(30);
    // ...and not far under it: within one rung of the essentials and one step of the day's own checkpoints.
    expect(end.used).toBeGreaterThanOrEqual(0);
  });

  it('other use first, then essentials: the lock comes at the goal, and the essentials after it change nothing', () => {
    const use: Use[] = [...Array<Use>(120).fill('other'), ...Array<Use>(200).fill('kept')];
    const { read, acted } = replay(use, 120);
    expect(acted.find((a) => a.mark === 'lock')?.minute).toBe(120);
    expect(read[read.length - 1].used).toBe(120);
  });
});
