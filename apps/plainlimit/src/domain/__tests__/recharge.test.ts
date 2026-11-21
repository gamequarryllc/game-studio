import { advance, freshDoc, repairDoc } from '../dayState';
import { withGoal } from '../goal';
import { batteryEnd, chosenRecharge, startWaitingRecharge, stepChosenRecharge, withRecharge } from '../recharge';
import type { Doc } from '../types';

const start = new Date(2026, 10, 20, 6, 0);
const afternoon = new Date(2026, 10, 20, 15, 0);

/** Through setup, `used` minutes into a 3-hour day that began at 6:00 AM on Nov 20. */
function doc(used = 30, extra: Partial<Doc> = {}): Doc {
  const d = freshDoc(start);
  return { ...d, setupDone: true, watching: true, day: { ...d.day, periodStart: start.toISOString(), usedMinutes: used, startGoalMinutes: 180 }, ...extra };
}

/** The document with a recharge time waiting, as the Settings stepper leaves it. */
function waiting(minute: number, d = doc()): Doc {
  return { ...d, settings: withRecharge(d, minute).settings };
}

describe('changing the recharge time', () => {
  it('cannot start a fresh battery now: the new time waits for this one to end', () => {
    // Moved to 2:30 PM at 3:00 PM, it would have started a battery half an hour ago.
    const d = waiting(14 * 60 + 30);
    expect(d.settings).toMatchObject({ rechargeMinute: 360, nextRechargeMinute: 870 });
    expect(chosenRecharge(d.settings)).toBe(870);
    expect(advance(d, afternoon)).toBe(d);
  });

  it('is at once on setup\'s own day', () => {
    const first = doc(30, { day: { ...doc().day, firstDay: true } });
    expect(withRecharge(first, 390)).toEqual({ settings: expect.objectContaining({ rechargeMinute: 390 }), now: true });
    expect(withRecharge(first, 390).settings.nextRechargeMinute).toBeUndefined();
  });

  it('steps from the time chosen, and stepping back to today\'s takes the waiting one away', () => {
    const later = { ...doc(), settings: stepChosenRecharge(doc(), 1).settings };
    expect(later.settings.nextRechargeMinute).toBe(390);
    const back = stepChosenRecharge(later, -1);
    expect(back.now).toBe(false);
    expect(back.settings.nextRechargeMinute).toBeUndefined();
    expect(back.settings.rechargeMinute).toBe(360);
  });
});

describe('when the battery ends', () => {
  it('is the next recharge with nothing waiting', () => {
    expect(batteryEnd(doc().day, doc().settings)).toEqual(new Date(2026, 10, 21, 6, 0));
  });

  it('is still the planned recharge when the new time is earlier: the next battery counts from it', () => {
    const d = waiting(4 * 60);
    expect(batteryEnd(d.day, d.settings)).toEqual(new Date(2026, 10, 21, 6, 0));
    const next = advance(d, new Date(2026, 10, 21, 6, 1));
    expect(next.settings.rechargeMinute).toBe(240);
    expect(next.settings.nextRechargeMinute).toBeUndefined();
    expect(next.day.periodStart).toBe(new Date(2026, 10, 21, 4, 0).toISOString());
    expect(next.day.usedMinutes).toBe(0);
    expect(next.history[0]).toMatchObject({ start: start.toISOString(), usedMinutes: 30 });
  });

  it('runs on to the new time when it is later, as the same battery', () => {
    const d = waiting(8 * 60);
    expect(batteryEnd(d.day, d.settings)).toEqual(new Date(2026, 10, 21, 8, 0));
    const at7 = advance(d, new Date(2026, 10, 21, 7, 0));
    expect(at7.settings.rechargeMinute).toBe(480);
    expect(at7.day).toMatchObject({ periodStart: new Date(2026, 10, 20, 8, 0).toISOString(), usedMinutes: 30 });
    expect(at7.history).toEqual([]);
    expect(batteryEnd(at7.day, at7.settings)).toEqual(new Date(2026, 10, 21, 8, 0));
    // Nothing more happens until 8:00, then a fresh battery.
    expect(advance(at7, new Date(2026, 10, 21, 7, 59))).toBe(at7);
    const at8 = advance(at7, new Date(2026, 10, 21, 8, 0));
    expect(at8.day.periodStart).toBe(new Date(2026, 10, 21, 8, 0).toISOString());
    expect(at8.history).toHaveLength(1);
  });

  it('takes the shorter way over: twelve hours or more later is counted as earlier', () => {
    // 6:00 AM to 8:00 PM is 14 hours later or 10 earlier: the next battery starts at 6:00 AM, counted from 8:00 PM.
    const d = waiting(20 * 60);
    expect(batteryEnd(d.day, d.settings)).toEqual(new Date(2026, 10, 21, 6, 0));
    expect(advance(d, new Date(2026, 10, 21, 6, 1)).day.periodStart).toBe(new Date(2026, 10, 20, 20, 0).toISOString());
  });

  it('starts the new time as usual when the app first looks after it', () => {
    const d = waiting(8 * 60);
    const late = advance(d, new Date(2026, 10, 21, 12, 0));
    expect(late.settings.rechargeMinute).toBe(480);
    expect(late.day.periodStart).toBe(new Date(2026, 10, 21, 8, 0).toISOString());
    expect(late.history).toHaveLength(1);
  });

  it('does nothing before the planned end', () => {
    const d = waiting(8 * 60);
    expect(startWaitingRecharge(d, new Date(2026, 10, 21, 5, 59))).toEqual({ doc: d, runsOn: false });
  });
});

describe('with a higher goal waiting too', () => {
  const both = waiting(8 * 60, withGoal(doc(), 240));

  it('keeps today\'s goal while the battery runs on, and starts it with the new battery', () => {
    expect(both.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 240, nextRechargeMinute: 480 });
    const at7 = advance(both, new Date(2026, 10, 21, 7, 0));
    expect(at7.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 240, rechargeMinute: 480 });
    const at8 = advance(at7, new Date(2026, 10, 21, 8, 0));
    expect(at8.settings.goalMinutes).toBe(240);
    expect(at8.history[0].goalMinutes).toBe(180);
  });

  it('starts both at once with an earlier time', () => {
    const early = waiting(4 * 60, withGoal(doc(), 240));
    const next = advance(early, new Date(2026, 10, 21, 6, 0));
    expect(next.settings).toMatchObject({ goalMinutes: 240, rechargeMinute: 240 });
  });
});

describe('reading a saved copy back', () => {
  it('keeps a waiting recharge time, tidied to half hours, and drops one equal to today\'s', () => {
    const saved = (next: unknown) => repairDoc({ settings: { goalMinutes: 180, rechargeMinute: 360, nextRechargeMinute: next }, setupDone: true, day: { periodStart: start.toISOString(), usedMinutes: 30, topUps: 0 } }, afternoon);
    expect(saved(485).settings.nextRechargeMinute).toBe(480);
    expect(saved(360).settings.nextRechargeMinute).toBeUndefined();
    expect(saved('soon').settings.nextRechargeMinute).toBeUndefined();
  });
});
