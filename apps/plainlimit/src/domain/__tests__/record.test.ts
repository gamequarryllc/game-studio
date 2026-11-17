import { addWeeklyPasses, freshRecord, nextPassDate, passActive, passCheck, recordView, repairRecord, settingsLockedNotice, spendPass, weekKey, type PassRecord } from '../record';
import type { DaySummary } from '../types';

const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min);

describe('emergency passes', () => {
  it('starts with one, and weeks start on Monday', () => {
    expect(weekKey(at(11, 17))).toBe('2026-11-16'); // a Tuesday
    expect(weekKey(at(11, 16))).toBe('2026-11-16'); // the Monday itself
    expect(weekKey(at(11, 22))).toBe('2026-11-16'); // Sunday
    const r = freshRecord(at(11, 17));
    expect(r.passes).toBe(1);
    expect(nextPassDate(r)).toEqual(new Date(2026, 10, 23));
  });

  it('adds one a week, and they bank with no limit', () => {
    const r = freshRecord(at(11, 17));
    expect(addWeeklyPasses(r, at(11, 22)).passes).toBe(1);
    expect(addWeeklyPasses(r, at(11, 23, 0, 5)).passes).toBe(2);
    const year = addWeeklyPasses(freshRecord(at(1, 5)), at(12, 28));
    expect(year.passes).toBe(1 + 51);
    expect(addWeeklyPasses(year, at(12, 28)).passes).toBe(52);
  });

  it('can be used once a battery day, opens for 15 minutes or until the recharge', () => {
    const now = at(11, 17, 21, 0);
    const dayStart = at(11, 17, 6, 0);
    const recharge = at(11, 18, 6, 0).getTime();
    let r: PassRecord = { ...freshRecord(at(11, 1)), passes: 2 };
    expect(passCheck(r, dayStart, now)).toBe('ok');
    r = spendPass(r, now, recharge);
    expect(r.passes).toBe(1);
    expect(r.passUntil).toBe(at(11, 17, 21, 15).toISOString());
    expect(passActive(r, at(11, 17, 21, 10))).toBe(true);
    expect(passCheck(r, dayStart, at(11, 17, 21, 10))).toBe('running');
    expect(passCheck(r, dayStart, at(11, 17, 23, 0))).toBe('usedToday');
    // The next battery day it can be used again.
    expect(passCheck(r, at(11, 18, 6, 0), at(11, 18, 9, 0))).toBe('ok');
    expect(spendPass(r, at(11, 18, 5, 50), recharge).passUntil).toBe(new Date(recharge).toISOString());
    expect(passCheck({ ...r, passes: 0, uses: [] }, at(11, 18, 6, 0), at(11, 18, 9, 0))).toBe('none');
  });

  it('reads back a saved copy, mending what is odd', () => {
    const now = at(11, 17);
    expect(repairRecord(null, now)).toEqual(freshRecord(now));
    const r = repairRecord({ passes: 3.7, lastAdded: 'nope', uses: ['2026-11-01T10:00:00.000Z', 'bad', 7] }, now);
    expect(r.passes).toBe(3);
    expect(r.lastAdded).toBe(weekKey(now));
    expect(r.uses).toEqual(['2026-11-01T10:00:00.000Z']);
  });
});

describe('the record', () => {
  const goal = 180;
  const day = (m: number, d: number, used: number, state: DaySummary['state'] = 'counted'): DaySummary => ({ start: at(m, d, 6).toISOString(), goalMinutes: goal, usedMinutes: used, topUps: 0, state });

  it('counts perfect weeks, the run without a pass and the best run, and marks pass days', () => {
    const now = at(11, 18, 12); // Wednesday
    // Two full weeks before this one: Nov 2-8 all under (perfect), Nov 9-15 with a day that ran out.
    const history: DaySummary[] = [];
    for (let d = 2; d <= 8; d++) history.push(day(11, d, 100));
    for (let d = 9; d <= 15; d++) history.push(day(11, d, d === 12 ? 200 : 90));
    history.push(day(11, 16, 80), day(11, 17, 70));
    const r: PassRecord = { passes: 3, lastAdded: '2026-11-16', since: at(9, 1).toISOString(), uses: [at(10, 11, 22).toISOString()], passUntil: null };
    const view = recordView(r, history, day(11, 18, 40), now);
    expect(view.perfectWeeks).toBe(1);
    expect(view.passes).toBe(3);
    expect(view.streakWeeks).toBe(5); // Oct 11 to Nov 18
    expect(view.bestWeeks).toBe(5); // Sep 1 to Oct 11 is 5 weeks and 5 days, the same whole weeks
    expect(view.weeks).toHaveLength(12);
    const last = view.weeks[11];
    expect(last.start).toBe('2026-11-16');
    expect(last.days.map((d) => d.cell)).toEqual(['under', 'under', 'under', 'future', 'future', 'future', 'future']);
    expect(view.weeks[10].perfect).toBe(false);
    expect(view.weeks[9].perfect).toBe(true);
    // Oct 11 was a Sunday: the week of Oct 5 has its last day marked, and is not perfect.
    const passWeek = view.weeks.find((w) => w.start === '2026-10-05');
    expect(passWeek?.days[6].pass).toBe(true);
    expect(passWeek?.perfect).toBe(false);
    expect(view.used).toEqual([at(10, 11, 22)]);
  });

  it('marks a pass on the battery day it was used in, even after midnight', () => {
    const now = at(11, 18, 12);
    const r: PassRecord = { ...freshRecord(at(11, 1)), uses: [at(11, 17, 2).toISOString()] };
    const view = recordView(r, [], day(11, 18, 40), now, 6 * 60);
    // 2 AM Tuesday, before the 6 AM recharge, is Monday's battery.
    expect(view.weeks[11].days[0].pass).toBe(true);
    expect(view.weeks[11].days[1].pass).toBe(false);
  });

  it('does not call a week perfect if a day was only partly counted', () => {
    const now = at(11, 18, 12);
    const history: DaySummary[] = [];
    for (let d = 2; d <= 8; d++) history.push(day(11, d, 100, d === 4 ? 'partly' : 'counted'));
    const view = recordView(freshRecord(at(11, 1)), history, day(11, 18, 40), now);
    expect(view.perfectWeeks).toBe(0);
  });
});

describe('the settings-locked notice', () => {
  it('names the emergency pass only when one can be used now', () => {
    expect(settingsLockedNotice('6:00 AM', 'ok')).toContain('An emergency pass, on Today, opens them for 15 minutes.');
    expect(settingsLockedNotice('6:00 AM', 'none')).not.toContain('pass');
    expect(settingsLockedNotice('6:00 AM', 'usedToday')).toContain('Today’s emergency pass has been used.');
    expect(settingsLockedNotice('6:00 AM', 'usedToday')).not.toContain('opens them');
    expect(settingsLockedNotice('6:00 AM', 'running')).toBe('The battery is empty, so these settings are locked until it recharges at 6:00 AM.');
  });
});
