import { asGuard, believable, checkpointsFor, GUARD_MS, guardFor, guardFrom, judgedFrom, keepsPace, minuteTicksFor, mostByNow, paceRules, roundName, type Guard } from '../checkpoints';
import { earliestTrue, lockNotBefore } from '../monitorPlan';
import { countDay, doubtful, marksOf, miscounted, roundSettled, roundStanding, withFloor, type Report, type Rounds } from '../reports';

/** A clock for one day in November 2026, in milliseconds. */
const november = (date: number) => (h: number, m = 0, s = 0) => new Date(2026, 10, date, h, m, s).getTime();
const oneRound = (round: string): Rounds => ({ round, roundBefore: '', goalBefore: 0, picksChangedAt: 0 });
const report = (id: string, round: string, at: number): Report => ({ name: roundName(id, round), at });
const names = (reports: Report[]) => reports.map((r) => r.name).sort();

describe('a change of goal while the phone re-reports the day (build 154: "Plenty left" for 20 seconds after lowering the goal)', () => {
  const day = november(24);
  const start = day(6);
  // 2:07 used, under a 2:30 goal registered in round "a": cells of 25 minutes.
  const inA = ['cell-1', 'cell-2', 'cell-3', 'cell-4', 'cell-5'].map((id, i) => report(id, 'a', day(9 + i)));

  it('keeps the round with reports standing when the one ending has none yet', () => {
    expect(roundStanding(new Set(['a']), 'b', 'a')).toBe('a');
    expect(roundStanding(new Set(['a', 'b']), 'b', 'a')).toBe('b');
    // Nothing reported anywhere: the ending round, as before.
    expect(roundStanding(new Set(), 'b', 'a')).toBe('b');
  });

  it('counts from that round until the new one has been re-reported, so the battery does not show full', () => {
    // Lowered at 10:36 PM (round b, from a), then again at 10:36:51 (round c): b never got a report.
    const changedAt = day(22, 36, 51);
    const stands = roundStanding(new Set(['a']), 'b', 'a');
    const rounds: Rounds = { round: 'c', roundBefore: stands, goalBefore: 150, picksChangedAt: changedAt };
    expect(countDay({ reports: inA, goalMinutes: 90, dayStart: start, rounds, guard: null, now: changedAt + 25_000 })).toBeGreaterThanOrEqual(125);
  });

  it('never counts less than was known when only the goal changed, while the new round fills in', () => {
    const floor = { round: 'c', dayStart: start, minutes: 125 };
    expect(withFloor(0, floor, 'c', start)).toBe(125);
    expect(withFloor(130, floor, 'c', start)).toBe(130);
    // Another round (new picks) or another day: no floor.
    expect(withFloor(40, floor, 'd', start)).toBe(40);
    expect(withFloor(40, floor, 'c', day(30))).toBe(40);
    expect(withFloor(40, null, 'c', start)).toBe(40);
  });
});

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

describe('keeping pace with the clock', () => {
  const clock = november(24);
  const minute = 60000;

  it('takes a report for M minutes as false if it came sooner than M - L minutes after one for L, less twenty', () => {
    const earlier = [{ minutes: 60, at: clock(14, 11) }];
    expect(keepsPace(120, clock(14, 27), earlier, 0)).toBe(false);
    expect(keepsPace(120, clock(14, 51), earlier, 0)).toBe(true);
    // Within twenty minutes of an earlier report, anything goes (the phone may have been slow with it).
    expect(keepsPace(80, clock(14, 11, 30), earlier, 0)).toBe(true);
  });

  it('is only judged against earlier reports for fewer minutes', () => {
    expect(keepsPace(120, clock(14, 27), [{ minutes: 60, at: clock(14, 30) }], 0)).toBe(true);
    expect(keepsPace(60, clock(14, 27), [{ minutes: 120, at: clock(14, 26) }], 0)).toBe(true);
  });

  it('leaves out reports made just after a registration: the phone re-reports the day then, with fresh times', () => {
    const registered = clock(15);
    const reReported = [{ minutes: 60, at: registered + 5000 }];
    expect(keepsPace(100, clock(15, 15), reReported, 0)).toBe(false);
    expect(keepsPace(100, clock(15, 15), reReported, registered)).toBe(true);
    // Once the guard has closed, reports count again.
    expect(keepsPace(100, clock(15, 15), [{ minutes: 60, at: registered + GUARD_MS + minute }], registered)).toBe(false);
  });

  it('gives the phone, for each checkpoint, how long after each lower one it may first act', () => {
    const all = [...checkpointsFor(120), ...minuteTicksFor(120)].map((c) => ({ name: c.id, minutes: c.minutes }));
    const rules = paceRules(120, all);
    expect(rules).toContainEqual({ name: 'cell-3', ms: 40 * minute });
    expect(rules).toContainEqual({ name: 'cell-1', ms: 80 * minute });
    // Twenty minutes below or closer says nothing.
    expect(rules.find((r) => r.name === 'cell-5')).toBeUndefined();
    expect(rules.find((r) => r.name === 'empty')).toBeUndefined();
  });
});

/** The monitor extension's check (patches/react-native-device-activity+0.6.1.patch, plainlimitTooSoon). */
function phoneSaysTooSoon(rules: { name: string; ms: number }[], stored: Record<string, number>, now: number, skipFrom = 0, skipTo = 0): boolean {
  return rules.some(({ name, ms }) => {
    const at = stored[name] ?? 0;
    if (!(at > 0)) return false;
    if (skipTo > skipFrom && at >= skipFrom && at <= skipTo) return false;
    return at < now && now < at + ms;
  });
}

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

  it('24 November, build 150: a burst of reports for nothing locks nothing and counts for nothing', () => {
    // Goal 2:00, counted from 6 AM, registered the evening before. The 60-minute
    // mark came at 2:11:12 PM; then, with the phone charging, empty, the last
    // warning and the fifth cell within two seconds at 2:27; the fourth cell
    // only at 2:34. The phone's own report said 1:15 used at 2:27.
    const clock = november(24);
    const dayStart = clock(6);
    const registeredAt = new Date(2026, 10, 23, 20, 58, 57).getTime();
    const guard: Guard = { from: new Date(2026, 10, 23, 19, 18, 57).getTime(), opens: registeredAt, closes: registeredAt + GUARD_MS };
    const reports = [
      report('cell-1', 'r', clock(10, 22, 44)),
      report('cell-2', 'r', clock(10, 44, 21)),
      report('cell-3', 'r', clock(14, 11, 12)),
      report('empty', 'r', clock(14, 27, 49)),
      report('final-warning', 'r', clock(14, 27, 50)),
      report('cell-5', 'r', clock(14, 27, 51)),
      report('cell-4', 'r', clock(14, 34, 22)),
    ];
    const count = (now: number, upTo = reports) => countDay({ reports: upTo.filter((r) => r.at <= now), goalMinutes: 120, dayStart, rounds: oneRound('r'), guard, now, registeredAt });
    // Build 150 believed it: judged from the day's start alone, empty at 2:27 could be true.
    const empty = checkpointsFor(120).find((c) => c.id === 'empty');
    if (!empty) throw new Error('no empty');
    expect(believable(empty, new Date(dayStart), guard, new Date(clock(14, 27, 49)))).toBe(true);
    // Paced, the burst is thrown out: 1:00 known at 2:28, and the fourth cell at 2:34 is real.
    expect(count(clock(14, 28))).toBe(60);
    expect(count(clock(14, 35))).toBe(80);
    expect(names(doubtful(reports, 120, 'r', new Date(dayStart), guard, registeredAt))).toEqual([roundName('cell-5', 'r'), roundName('empty', 'r'), roundName('final-warning', 'r')].sort());
    expect(miscounted(reports, 120, 'r', new Date(dayStart), guard, registeredAt)).toBe(true);

    // On the phone: each of the burst's actions (the empty lock, the last warning, the fifth cell's screen) is held back...
    const all = [...checkpointsFor(120), ...minuteTicksFor(120)].map((c) => ({ name: roundName(c.id, 'r'), minutes: c.minutes }));
    const storedBy = (now: number) => Object.fromEntries(reports.filter((r) => r.at < now).map((r) => [r.name, r.at]));
    for (const [id, minutes] of [['empty', 120], ['final-warning', 113], ['cell-5', 100]] as const) {
      const at = reports.find((r) => r.name === roundName(id, 'r'))?.at ?? 0;
      expect(phoneSaysTooSoon(paceRules(minutes, all), storedBy(at), at, registeredAt, registeredAt + GUARD_MS)).toBe(true);
    }
    // ...while the real reports before it would all have acted.
    for (const [id, minutes] of [['cell-1', 20], ['cell-2', 40], ['cell-3', 60], ['cell-4', 80]] as const) {
      const at = reports.find((r) => r.name === roundName(id, 'r'))?.at ?? 0;
      expect(phoneSaysTooSoon(paceRules(minutes, all), storedBy(at), at, registeredAt, registeredAt + GUARD_MS)).toBe(false);
    }
    // The real empty, had it come at its time (an hour after the 60-minute mark), acts.
    const realEmpty = clock(15, 12);
    expect(phoneSaysTooSoon(paceRules(120, all), { [roundName('cell-3', 'r')]: clock(14, 11, 12), [roundName('cell-4', 'r')]: clock(14, 34, 22) }, realEmpty)).toBe(false);
    expect(marksOf(reports, 120, 'r', dayStart)).toHaveLength(7);
  });

  it('after counting again, the re-reported day does not make the real end look too soon', () => {
    // Counted again at 3:00 PM: the phone re-reports 1:20 within seconds; 40
    // minutes of real use later the battery runs out.
    const clock = november(24);
    const dayStart = clock(6);
    const registeredAt = clock(15);
    const guard = guardFor({ at: clock(14, 59), most: 110 }, registeredAt, new Date(dayStart));
    const again = registeredAt + 3000;
    const reports = ['cell-1', 'cell-2', 'cell-3', 'cell-4'].map((id) => report(id, 'r', again)).concat([report('cell-5', 'r', clock(15, 20)), report('final-warning', 'r', clock(15, 33)), report('empty', 'r', clock(15, 40))]);
    expect(countDay({ reports, goalMinutes: 120, dayStart, rounds: oneRound('r'), guard, now: clock(15, 41), registeredAt })).toBe(120);
    expect(doubtful(reports, 120, 'r', new Date(dayStart), guard, registeredAt)).toEqual([]);
    const all = [...checkpointsFor(120), ...minuteTicksFor(120)].map((c) => ({ name: roundName(c.id, 'r'), minutes: c.minutes }));
    const stored = Object.fromEntries(reports.filter((r) => r.at < clock(15, 40)).map((r) => [r.name, r.at]));
    expect(phoneSaysTooSoon(paceRules(120, all), stored, clock(15, 40), registeredAt, registeredAt + GUARD_MS)).toBe(false);
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
