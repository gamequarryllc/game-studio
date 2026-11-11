import { clockLabel, durationLabel, goalLabel, nextRecharge, periodStart, untilLabel, wrapMinute } from '../day';
import { freshDay, freshDoc, grantTopUp, isUnlocked, repairDoc, rollOver, withUse } from '../dayState';

const SIX = 6 * 60;

describe('the recharge clock', () => {
  it('starts the day at the last recharge, not at midnight', () => {
    expect(periodStart(new Date(2026, 10, 11, 9, 0), SIX)).toEqual(new Date(2026, 10, 11, 6, 0));
    expect(periodStart(new Date(2026, 10, 11, 6, 0), SIX)).toEqual(new Date(2026, 10, 11, 6, 0));
    expect(periodStart(new Date(2026, 10, 11, 5, 59), SIX)).toEqual(new Date(2026, 10, 10, 6, 0));
    expect(periodStart(new Date(2026, 10, 12, 1, 30), SIX)).toEqual(new Date(2026, 10, 11, 6, 0));
  });

  it('knows when the next recharge is', () => {
    expect(nextRecharge(new Date(2026, 10, 11, 22, 0), SIX)).toEqual(new Date(2026, 10, 12, 6, 0));
    expect(nextRecharge(new Date(2026, 10, 11, 5, 0), SIX)).toEqual(new Date(2026, 10, 11, 6, 0));
    expect(nextRecharge(new Date(2026, 10, 11, 6, 0), SIX)).toEqual(new Date(2026, 10, 12, 6, 0));
  });

  it('crosses a month end and a clock change without losing a day', () => {
    expect(periodStart(new Date(2026, 11, 1, 2, 0), SIX)).toEqual(new Date(2026, 10, 30, 6, 0));
    // The night the clocks go back (1 November 2026 in the US): still one recharge per calendar day.
    expect(nextRecharge(new Date(2026, 9, 31, 23, 0), SIX)).toEqual(new Date(2026, 10, 1, 6, 0));
  });

  it('writes times and lengths the way the screens show them', () => {
    expect(clockLabel(SIX)).toBe('6:00 AM');
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(12 * 60 + 5)).toBe('12:05 PM');
    expect(clockLabel(23 * 60 + 30)).toBe('11:30 PM');
    expect(clockLabel(-30)).toBe('11:30 PM');
    expect(wrapMinute(1440 + 90)).toBe(90);
    expect(durationLabel(130)).toBe('2:10');
    expect(durationLabel(0)).toBe('0:00');
    expect(durationLabel(-4)).toBe('0:00');
    expect(goalLabel(180)).toBe('3 hour day');
    expect(goalLabel(150)).toBe('2.5 hour day');
    expect(goalLabel(105)).toBe('1.75 hour day');
  });
});

describe('how long until the recharge', () => {
  const at = (h: number, m: number, sec = 0) => new Date(2026, 10, 11, h, m, sec);
  it('says it in the fewest words', () => {
    expect(untilLabel(at(16, 20), new Date(2026, 10, 12, 6, 0))).toBe('in 13 h 40 min');
    expect(untilLabel(at(5, 20), at(6, 0))).toBe('in 40 min');
    expect(untilLabel(at(4, 0), at(6, 0))).toBe('in 2 h');
    expect(untilLabel(at(5, 59, 30), at(6, 0))).toBe('in 1 min');
    expect(untilLabel(at(6, 0), at(6, 0))).toBe('now');
    expect(untilLabel(at(7, 0), at(6, 0))).toBe('now');
  });
});

describe('the day', () => {
  const morning = new Date(2026, 10, 11, 9, 0);

  it('keeps its use until the next recharge, then starts over', () => {
    const day = withUse(freshDay(morning, SIX), 200);
    expect(rollOver(day, new Date(2026, 10, 11, 23, 59), SIX)).toBe(day);
    expect(rollOver(day, new Date(2026, 10, 12, 5, 59), SIX)).toBe(day);
    const next = rollOver(day, new Date(2026, 10, 12, 6, 0), SIX);
    expect(next.usedMinutes).toBe(0);
    expect(next.topUps).toBe(0);
    expect(next.unlockedUntil).toBeNull();
  });

  it('never counts below zero', () => {
    expect(withUse(freshDay(morning, SIX), -30).usedMinutes).toBe(0);
  });

  it('gives less time for each top-up, and none past the recharge', () => {
    const night = new Date(2026, 10, 11, 22, 0);
    let day = freshDay(night, SIX);
    day = grantTopUp(day, night, SIX);
    expect(day.unlockedUntil).toBe(new Date(2026, 10, 11, 22, 15).toISOString());
    expect(isUnlocked(day, new Date(2026, 10, 11, 22, 14))).toBe(true);
    expect(isUnlocked(day, new Date(2026, 10, 11, 22, 15))).toBe(false);
    day = grantTopUp(day, new Date(2026, 10, 11, 22, 5), SIX);
    expect(day.unlockedUntil).toBe(new Date(2026, 10, 11, 22, 25).toISOString());
    day = grantTopUp(day, new Date(2026, 10, 11, 23, 0), SIX);
    expect(day.unlockedUntil).toBe(new Date(2026, 10, 11, 23, 5).toISOString());
    expect(day.topUps).toBe(3);

    const almost = new Date(2026, 10, 12, 5, 55);
    const late = grantTopUp(freshDay(night, SIX), almost, SIX);
    expect(late.unlockedUntil).toBe(new Date(2026, 10, 12, 6, 0).toISOString());
  });
});

describe('reading a saved copy', () => {
  const now = new Date(2026, 10, 11, 9, 0);

  it('starts over from nothing or from nonsense', () => {
    for (const raw of [null, undefined, 7, 'x', [], { settings: 5, day: 'no' }]) {
      const doc = repairDoc(raw, now);
      expect(doc.settings.goalMinutes).toBe(180);
      expect(doc.settings.allowed).toEqual(['Phone', 'Messages', 'Maps']);
      expect(doc.day.usedMinutes).toBe(0);
    }
  });

  it('keeps what is valid and mends what is not', () => {
    const doc = repairDoc(
      {
        settings: { goalMinutes: 97, rechargeMinute: 1500, countMode: 'timeWasters', emptyLevel: 'nope', allowed: ['Phone', ' phone ', 4, '', 'Camera'] },
        day: { periodStart: new Date(2026, 10, 11, 1, 0).toISOString(), usedMinutes: 55, topUps: 2.7, unlockedUntil: 'never' },
      },
      now,
    );
    expect(doc.settings).toEqual({ goalMinutes: 90, rechargeMinute: 60, countMode: 'timeWasters', emptyLevel: 'work', allowed: ['Phone', 'Camera'] });
    expect(doc.day).toEqual({ periodStart: new Date(2026, 10, 11, 1, 0).toISOString(), usedMinutes: 55, topUps: 2, unlockedUntil: null });
  });

  it('drops a day that has already been recharged away', () => {
    const doc = repairDoc({ settings: {}, day: { periodStart: new Date(2026, 10, 9, 6, 0).toISOString(), usedMinutes: 170, topUps: 1 } }, now);
    expect(doc.day.usedMinutes).toBe(0);
    expect(doc.day.periodStart).toBe(new Date(2026, 10, 11, 6, 0).toISOString());
  });

  it('makes a fresh copy with its own list', () => {
    const a = freshDoc(now);
    a.settings.allowed.push('Camera');
    expect(freshDoc(now).settings.allowed).toEqual(['Phone', 'Messages', 'Maps']);
  });
});
