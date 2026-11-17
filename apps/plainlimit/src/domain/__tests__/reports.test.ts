import { asGuard, believable, checkpointsFor, GUARD_MS, guardFor, guardFrom, judgedFrom, mostByNow, roundName, type Guard } from '../checkpoints';
import { earliestTrue, lockNotBefore } from '../monitorPlan';
import { countDay, doubtful, miscounted, roundSettled, type Report, type Rounds } from '../reports';

/** A clock for one day in November 2026, in milliseconds. */
const november = (date: number) => (h: number, m = 0, s = 0) => new Date(2026, 10, date, h, m, s).getTime();
const oneRound = (round: string): Rounds => ({ round, roundBefore: '', goalBefore: 0, picksChangedAt: 0 });
const report = (id: string, round: string, at: number): Report => ({ name: roundName(id, round), at });
const names = (reports: Report[]) => reports.map((r) => r.name).sort();

describe('a miscounted day', () => {
  const start = new Date(2026, 10, 11, 6, 0);
  const at = (minutes: number) => start.getTime() + minutes * 60000;

  it('is one where a cell, the warning or empty arrived too soon to be true', () => {
    expect(miscounted([report('cell-1', 'r', at(31)), report('cell-2', 'r', at(65))], 180, 'r', start, null)).toBe(false);
    expect(miscounted([report('empty', 'r', at(0.2))], 180, 'r', start, null)).toBe(true);
    expect(miscounted([report('cell-3', 'r', at(40))], 180, 'r', start, null)).toBe(true);
  });

  it('is not judged on reports from before the count began, from another round, or on minute checkpoints', () => {
    expect(miscounted([report('empty', 'r', at(-600))], 180, 'r', start, null)).toBe(false);
    expect(miscounted([report('empty', 'old', at(0.2))], 180, 'r', start, null)).toBe(false);
    expect(miscounted([report('m40', 'r', at(1))], 180, 'r', start, null)).toBe(false);
  });
});

describe('the guard after a registration', () => {
  // Counting from the recharge at 6:00. At 13:58, while counting worked, at most
  // 45 minutes had been used; at 14:00 the day was registered again.
  const clock = november(11);
  const dayStart = new Date(clock(6));
  const noted = { at: clock(13, 58), most: 45 };
  const guard = guardFor(noted, clock(14), dayStart);

  it('starts the count that many minutes before the note, for the ten minutes after registering', () => {
    expect(guard).toEqual({ from: clock(13, 13), opens: clock(14), closes: clock(14) + GUARD_MS });
    expect(judgedFrom(dayStart, guard, new Date(clock(14, 1)))).toEqual(new Date(clock(13, 13)));
    expect(guardFrom(dayStart, guard)).toEqual(new Date(clock(13, 13)));
    // Before the registration and after the guard closes, reports are judged from the recharge.
    expect(judgedFrom(dayStart, guard, new Date(clock(13, 59)))).toEqual(dayStart);
    expect(judgedFrom(dayStart, guard, new Date(clock(14, 11)))).toEqual(dayStart);
  });

  it('is only made from a figure noted before the registration and since the recharge', () => {
    expect(guardFor(noted, clock(13, 50), dayStart)).toBeNull();
    expect(guardFor(noted, 0, dayStart)).toBeNull();
    expect(guardFor(null, clock(14), dayStart)).toBeNull();
    expect(guardFor({ at: clock(5), most: 30 }, clock(14), dayStart)).toBeNull();
    // Never earlier than the recharge.
    expect(guardFor({ at: clock(6, 10), most: 45 }, clock(7), dayStart)?.from).toBe(dayStart.getTime());
  });

  it('reads back only a whole record', () => {
    expect(asGuard(guard)).toEqual(guard);
    expect(asGuard({ from: 1, opens: 2 })).toBeNull();
    expect(asGuard({ from: '1', opens: 2, closes: 3 })).toBeNull();
    expect(asGuard(null)).toBeNull();
  });
});

// Real days from the owner's phone, replayed through the same rules the app,
// the phone's locks and the widget use. Every phone bug found becomes one of these.
describe('replaying real days', () => {
  it('16 November, build 72: real reports the phone was late with all count', () => {
    // Goal 3:30, counted from 6 AM, registered in the morning. At 6:47:57 PM
    // the 45 and 60 minute marks had not come, so "at most 50" was noted.
    const clock = november(16);
    const dayStart = clock(6);
    const reports = [report('m15', 'r', clock(13)), report('m30', 'r', clock(15, 30)), report('cell-1', 'r', clock(16)), report('cell-2', 'r', clock(18, 58, 30)), report('cell-3', 'r', clock(19, 36, 15))];
    const noted = { at: clock(18, 47, 57), most: 50 };
    const guard = guardFor(noted, clock(9, 12), new Date(dayStart));
    expect(guard).toBeNull();
    expect(countDay({ reports, goalMinutes: 210, dayStart, rounds: oneRound('r'), guard, now: clock(19, 40) })).toBe(105);
    expect(doubtful(reports, 210, 'r', new Date(dayStart), guard)).toEqual([]);
    // The rule build 72 had, which judged every report after the note from it, threw both out
    // and held the empty battery's lock back until after 9 PM.
    const build72: Guard = { from: noted.at - 50 * 60000, opens: noted.at, closes: Number.POSITIVE_INFINITY };
    expect(names(doubtful(reports, 210, 'r', new Date(dayStart), build72))).toEqual([roundName('cell-2', 'r'), roundName('cell-3', 'r')]);
    expect(countDay({ reports, goalMinutes: 210, dayStart, rounds: oneRound('r'), guard: build72, now: clock(19, 40) })).toBe(35);
    expect(lockNotBefore(new Date(dayStart), build72, 210).getTime()).toBeGreaterThan(clock(21));
    expect(lockNotBefore(new Date(dayStart), guard, 210)).toEqual(earliestTrue(new Date(dayStart), 210));
  });

  it('14 November, build 49: turning counting off and on keeps the day', () => {
    // Goal 3:00. 1:02 used by 11:57 AM ("at most 75"); off and on at 11:58; the
    // phone re-reported the day so far within seconds.
    const clock = november(14);
    const dayStart = clock(6);
    const guard = guardFor({ at: clock(11, 57, 30), most: 75 }, clock(11, 58), new Date(dayStart));
    const again = clock(11, 58, 3);
    const reports = ['m10', 'm20', 'cell-1', 'm40', 'm50', 'cell-2'].map((id) => report(id, 'r', again));
    expect(countDay({ reports, goalMinutes: 180, dayStart, rounds: oneRound('r'), guard, now: clock(11, 59) })).toBe(60);
    expect(miscounted(reports, 180, 'r', new Date(dayStart), guard)).toBe(false);
  });

  it('a settings change in the afternoon: false reports right after registering are thrown out and lock nothing', () => {
    // iOS 26 has reported every checkpoint within seconds of registering (build
    // 28 locked everything on a full battery). 40 minutes really used by 1:58 PM.
    const clock = november(11);
    const dayStart = new Date(clock(6));
    const most = mostByNow(180, 40) ?? 0;
    const guard = guardFor({ at: clock(13, 58), most }, clock(14), dayStart);
    const burst = clock(14, 0, 3);
    const reports = checkpointsFor(180).map((c) => report(c.id, 'r', burst));
    // Judged from the recharge alone, all of them could pass: the guard is what stops them.
    expect(doubtful(reports, 180, 'r', dayStart, null)).toEqual([]);
    const thrownOut = names(doubtful(reports, 180, 'r', dayStart, guard));
    expect(thrownOut).toContain(roundName('cell-3', 'r'));
    expect(thrownOut).toContain(roundName('empty', 'r'));
    expect(thrownOut).not.toContain(roundName('cell-1', 'r'));
    // The count can be over by no more than the allowance for a slow phone.
    expect(countDay({ reports, goalMinutes: 180, dayStart: dayStart.getTime(), rounds: oneRound('r'), guard, now: clock(14, 1) })).toBeLessThanOrEqual(most);
    // Neither the empty lock nor the last-cell warning acts on the burst.
    expect(lockNotBefore(dayStart, guard, 180).getTime()).toBeGreaterThan(burst);
    expect(lockNotBefore(dayStart, guard, 150).getTime()).toBeGreaterThan(burst);
    // A report after the guard closes is judged from the recharge again.
    const cell3 = checkpointsFor(180).find((c) => c.id === 'cell-3');
    if (!cell3) throw new Error('no cell-3');
    expect(believable(cell3, dayStart, guard, new Date(clock(15, 30)))).toBe(true);
  });

  it('build 52: after unticking an app, the old list stands until the phone re-reports, and late old reports never count', () => {
    const clock = november(14);
    const dayStart = clock(6);
    const rounds: Rounds = { round: 'b', roundBefore: 'a', goalBefore: 180, picksChangedAt: clock(15) };
    const old = [report('cell-1', 'a', clock(10)), report('cell-2', 'a', clock(13))];
    const input = (reports: Report[], now: number) => countDay({ reports, goalMinutes: 180, dayStart, rounds, guard: null, now });
    // Nothing for the new list yet: the old figure stands.
    expect(input(old, clock(15, 0, 1))).toBe(60);
    // The phone re-reports the day for the new list; two quiet seconds later it is the figure.
    const fresh = [...old, report('cell-1', 'b', clock(15, 0, 2))];
    expect(roundSettled(fresh, rounds, dayStart, clock(15, 0, 3))).toBe(false);
    expect(input(fresh, clock(15, 0, 5))).toBe(30);
    // A report for the old list arriving 38 seconds after the change does not put the time back.
    expect(input([...fresh, report('cell-3', 'a', clock(15, 0, 38))], clock(15, 1))).toBe(30);
    // With no report for the new list, it takes over after a minute.
    expect(input(old, clock(15, 1))).toBe(0);
  });

  it('a finished day is closed from reports before its end', () => {
    const clock = november(12);
    const dayStart = clock(6);
    const reports = [report('cell-1', 'r', clock(9)), report('cell-2', 'r', clock(23)), report('cell-3', 'r', november(13)(6, 30))];
    expect(countDay({ reports, goalMinutes: 180, dayStart, periodEnd: november(13)(6), rounds: oneRound('r'), guard: null, now: november(13)(7) })).toBe(60);
  });
});
