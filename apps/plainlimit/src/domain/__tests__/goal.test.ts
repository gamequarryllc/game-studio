import { cellsLeft } from '../battery';
import { advance, freshDoc, repairDoc } from '../dayState';
import { canStepGoal, chosenGoal, goalFree, rechargePassed, stepChosenGoal, todayCap, todayFloor, withGoal } from '../goal';
import { GOAL_MAX } from '../settings';
import type { Doc } from '../types';

const SIX = 6 * 60;
const start = new Date(2026, 10, 20, 6, 0);

/** Through setup, `used` minutes into a 3-hour day that began at 6:00 AM on Nov 20. */
function doc(used = 0, extra: Partial<Doc> = {}): Doc {
  const d = freshDoc(start);
  return {
    ...d,
    setupDone: true,
    watching: true,
    day: { ...d.day, periodStart: start.toISOString(), usedMinutes: used, startGoalMinutes: 180 },
    ...extra,
  };
}

const up = (d: Doc, times = 1) => Array.from({ length: times }).reduce<Doc>((x) => stepChosenGoal(x, 1), d);
const down = (d: Doc, times = 1) => Array.from({ length: times }).reduce<Doc>((x) => stepChosenGoal(x, -1), d);

describe('raising the goal mid-day', () => {
  it('cannot refill a nearly empty battery', () => {
    const late = doc(170);
    expect(cellsLeft(170, late.settings.goalMinutes)).toBe(1);
    const raised = up(late, 4);
    // The battery still goes by today's 3 hours; 4 hours waits for the recharge.
    expect(raised.settings.goalMinutes).toBe(180);
    expect(raised.settings.nextGoalMinutes).toBe(240);
    expect(chosenGoal(raised.settings)).toBe(240);
    expect(cellsLeft(170, raised.settings.goalMinutes)).toBe(1);
  });

  it('lowers at once', () => {
    const lowered = down(doc(30), 2);
    expect(lowered.settings.goalMinutes).toBe(150);
    expect(lowered.settings.nextGoalMinutes).toBeUndefined();
  });

  it('goes back up at once as far as the goal the day started with, and no further', () => {
    const lowered = down(doc(30), 4);
    expect(lowered.settings.goalMinutes).toBe(120);
    const back = up(lowered, 4);
    expect(back.settings).toMatchObject({ goalMinutes: 180 });
    expect(back.settings.nextGoalMinutes).toBeUndefined();
    const past = up(back);
    expect(past.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 195 });
  });

  it('a jump past the start brings today back to the start and saves the rest for the recharge', () => {
    const lowered = down(doc(30), 4);
    expect(withGoal(lowered, 300).settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 300 });
  });

  it('stepping down from a waiting goal keeps it waiting until it reaches today', () => {
    const waiting = up(doc(30), 3);
    expect(waiting.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 225 });
    expect(down(waiting).settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 210 });
    const cleared = down(waiting, 3);
    expect(cleared.settings.goalMinutes).toBe(180);
    expect(cleared.settings.nextGoalMinutes).toBeUndefined();
    // And further down is today again, at once.
    expect(down(waiting, 4).settings.goalMinutes).toBe(165);
  });

  it('lowers no further than the first step above what is used, so one tap too many cannot empty the battery', () => {
    expect(todayFloor(doc(170))).toBe(180);
    expect(down(doc(170)).settings.goalMinutes).toBe(180);
    expect(canStepGoal(doc(170), -1)).toBe(false);
    expect(todayFloor(doc(100))).toBe(105);
    expect(down(doc(100), 10).settings.goalMinutes).toBe(105);
    expect(withGoal(doc(100), 30).settings.goalMinutes).toBe(105);
    // Exactly on a step: the next one up, as the battery would be empty at the step itself.
    expect(todayFloor(doc(90))).toBe(105);
    expect(todayFloor(doc(0))).toBe(30);
  });

  it('has no floor during setup, nor on a battery already empty', () => {
    expect(down(doc(170, { setupDone: false }), 4).settings.goalMinutes).toBe(120);
    expect(down(doc(240), 2).settings.goalMinutes).toBe(150);
  });

  it('a waiting goal steps down freely whatever is used', () => {
    expect(canStepGoal(up(doc(170), 2), -1)).toBe(true);
    expect(down(up(doc(170), 2)).settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 195 });
  });

  it('stays inside the limits', () => {
    expect(canStepGoal(withGoal(doc(170), GOAL_MAX), 1)).toBe(false);
    expect(canStepGoal(withGoal(doc(0), 30), -1)).toBe(false);
    expect(withGoal(doc(), 99_999).settings.nextGoalMinutes).toBe(GOAL_MAX);
    expect(withGoal(doc(), 1).settings.goalMinutes).toBe(30);
  });
});

describe('the first day is free', () => {
  it('changes at once during setup', () => {
    const d = doc(0, { setupDone: false });
    expect(goalFree(d)).toBe(true);
    const raised = up(d, 4);
    expect(raised.settings.goalMinutes).toBe(240);
    expect(raised.settings.nextGoalMinutes).toBeUndefined();
  });

  it('changes at once until the first recharge after setup', () => {
    const d = doc(170);
    const first = { ...d, day: { ...d.day, firstDay: true } };
    expect(up(first, 4).settings.goalMinutes).toBe(240);
    // The next battery is an ordinary one.
    const tomorrow = advance(up(first, 4), new Date(2026, 10, 21, 7, 0));
    expect(tomorrow.day.firstDay).toBeUndefined();
    expect(goalFree(tomorrow)).toBe(false);
    expect(up(tomorrow).settings).toMatchObject({ goalMinutes: 240, nextGoalMinutes: 255 });
  });
});

describe('while an emergency pass runs', () => {
  const passUp = (d: Doc, times = 1) => Array.from({ length: times }).reduce<Doc>((x) => stepChosenGoal(x, 1, true), d);

  it('raises today\'s goal at once, even on an empty battery', () => {
    const empty = doc(200);
    expect(cellsLeft(200, empty.settings.goalMinutes)).toBe(0);
    const raised = passUp(empty, 4);
    expect(raised.settings.goalMinutes).toBe(240);
    expect(raised.settings.nextGoalMinutes).toBeUndefined();
    expect(cellsLeft(200, raised.settings.goalMinutes)).toBeGreaterThan(0);
    expect(canStepGoal(empty, 1, true)).toBe(true);
  });

  it('makes the raised goal the day\'s own start, so down and up again after the pass stays today\'s', () => {
    const raised = passUp(doc(200), 4);
    expect(raised.day.startGoalMinutes).toBe(240);
    expect(todayCap(raised.day, raised.settings)).toBe(240);
    const after = up(down(raised));
    expect(after.settings).toMatchObject({ goalMinutes: 240 });
    expect(after.settings.nextGoalMinutes).toBeUndefined();
    // Past it, the usual rule again: from the recharge.
    expect(up(after).settings).toMatchObject({ goalMinutes: 240, nextGoalMinutes: 255 });
  });

  it('starts a goal that was waiting for the recharge today, one step on from it', () => {
    const waiting = up(doc(200), 4);
    expect(waiting.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 240 });
    const raised = passUp(waiting);
    expect(raised.settings.goalMinutes).toBe(255);
    expect(raised.settings.nextGoalMinutes).toBeUndefined();
  });

  it('lowers as usual, keeping the day\'s start', () => {
    const lowered = stepChosenGoal(doc(100), -1, true);
    expect(lowered.settings.goalMinutes).toBe(165);
    expect(lowered.day.startGoalMinutes).toBe(180);
  });
});

describe('at the recharge', () => {
  const waiting = up(doc(170), 4);

  it('starts the waiting goal, and the finished day keeps the goal it had', () => {
    const next = advance(waiting, new Date(2026, 10, 21, 6, 0));
    expect(next.settings.goalMinutes).toBe(240);
    expect(next.settings.nextGoalMinutes).toBeUndefined();
    expect(next.day.startGoalMinutes).toBe(240);
    expect(next.day.usedMinutes).toBe(0);
    expect(next.history[next.history.length - 1]).toMatchObject({ goalMinutes: 180, usedMinutes: 170 });
  });

  it('starts it after days the app never saw', () => {
    const next = advance(waiting, new Date(2026, 10, 24, 12, 0));
    expect(next.settings.goalMinutes).toBe(240);
  });

  it('keeps the goal as it was when nothing is waiting, lowered or not', () => {
    const lowered = down(doc(30), 2);
    const next = advance(lowered, new Date(2026, 10, 21, 6, 0));
    expect(next.settings.goalMinutes).toBe(150);
    expect(next.day.startGoalMinutes).toBe(150);
  });

  it('is not passed by moving the recharge time (Pro), which also starts a new battery', () => {
    const now = new Date(2026, 10, 20, 15, 0);
    expect(rechargePassed(waiting.day, now)).toBe(false);
    const moved = advance({ ...waiting, settings: { ...waiting.settings, rechargeMinute: SIX + 30 } }, now);
    expect(moved.day.periodStart).not.toBe(waiting.day.periodStart);
    expect(moved.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 240 });
    expect(todayCap(moved.day, moved.settings)).toBe(180);
    // A real recharge at the new time then starts it.
    const next = advance(moved, new Date(2026, 10, 21, 6, 30));
    expect(next.settings.goalMinutes).toBe(240);
  });

  it('a moved recharge time keeps the first day free', () => {
    const d = doc(30);
    const first = { ...d, day: { ...d.day, firstDay: true }, settings: { ...d.settings, rechargeMinute: SIX + 30 } };
    expect(advance(first, new Date(2026, 10, 20, 15, 0)).day.firstDay).toBe(true);
  });
});

describe('reading a saved copy back', () => {
  const now = new Date(2026, 10, 20, 15, 0);
  const savedDay = { periodStart: start.toISOString(), usedMinutes: 60, topUps: 0, unlockedUntil: null, uncounted: false };

  it('reads a copy from before the rule as starting with today\'s goal', () => {
    const d = repairDoc({ settings: { goalMinutes: 180 }, setupDone: true, day: savedDay }, now);
    expect(d.day.startGoalMinutes).toBe(180);
    expect(d.settings.nextGoalMinutes).toBeUndefined();
    expect(up(d).settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 195 });
  });

  it('keeps a waiting goal, and drops one that is not above the day\'s start', () => {
    const kept = repairDoc({ settings: { goalMinutes: 180, nextGoalMinutes: 241 }, setupDone: true, day: { ...savedDay, startGoalMinutes: 180 } }, now);
    expect(kept.settings.nextGoalMinutes).toBe(240);
    const dropped = repairDoc({ settings: { goalMinutes: 150, nextGoalMinutes: 180 }, setupDone: true, day: { ...savedDay, startGoalMinutes: 180 } }, now);
    expect(dropped.settings.nextGoalMinutes).toBeUndefined();
    expect(repairDoc({ settings: { goalMinutes: 180, nextGoalMinutes: 'lots' }, setupDone: true, day: savedDay }, now).settings.nextGoalMinutes).toBeUndefined();
  });

  it('never lets the day\'s start sit below today\'s goal', () => {
    const d = repairDoc({ settings: { goalMinutes: 240 }, setupDone: true, day: { ...savedDay, startGoalMinutes: 60 } }, now);
    expect(d.day.startGoalMinutes).toBe(240);
  });

  it('keeps the first day', () => {
    expect(repairDoc({ settings: {}, setupDone: true, day: { ...savedDay, firstDay: true } }, now).day.firstDay).toBe(true);
    expect(repairDoc({ settings: {}, setupDone: true, day: { ...savedDay, firstDay: 'yes' } }, now).day.firstDay).toBeUndefined();
  });

  it('starts a waiting goal saved before a recharge that has since passed', () => {
    const d = repairDoc({ settings: { goalMinutes: 180, nextGoalMinutes: 240 }, setupDone: true, watching: true, day: { ...savedDay, startGoalMinutes: 180 } }, new Date(2026, 10, 21, 9, 0));
    expect(d.settings.goalMinutes).toBe(240);
    expect(d.settings.nextGoalMinutes).toBeUndefined();
  });
});
