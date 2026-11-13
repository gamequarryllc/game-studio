import { DEFAULT_SETTINGS } from '../settings';
import type { DayState, DaySummary } from '../types';
import { dateKey, earnedLine, weekLine, weekView } from '../week';

const settings = { ...DEFAULT_SETTINGS, allowed: [] as string[] };
const now = new Date(2026, 10, 13, 12, 0); // a Friday, after the 6:00 AM recharge
const today: DayState = { periodStart: new Date(2026, 10, 13, 6, 0).toISOString(), usedMinutes: 40, topUps: 0, unlockedUntil: null, uncounted: false };
const past = (daysAgo: number, used: number, extra: Partial<DaySummary> = {}): DaySummary => ({
  start: new Date(2026, 10, 13 - daysAgo, 6, 0).toISOString(),
  goalMinutes: 180,
  usedMinutes: used,
  topUps: 0,
  state: 'counted',
  ...extra,
});

describe('the week view', () => {
  it('lays out the last seven batteries, today last, and leaves days it never saw unknown', () => {
    const week = weekView([past(1, 100), past(3, 200)], today, settings, now, true);
    expect(week.columns.map((c) => c.weekday)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(week.columns.map((c) => c.state)).toEqual(['unknown', 'unknown', 'unknown', 'counted', 'unknown', 'counted', 'counted']);
    expect(week.columns[6]).toMatchObject({ today: true, usedMinutes: 40, under: false, date: dateKey(new Date(2026, 10, 13)) });
  });

  it('counts days under the goal only when they were counted throughout', () => {
    const week = weekView([past(1, 100), past(2, 190), past(3, 50, { state: 'partly' }), past(4, 20, { state: 'off' })], today, settings, now, true);
    expect(week.countedDays).toBe(2);
    expect(week.underDays).toBe(1);
    expect(weekLine(week)).toBe('Under your goal 1 of the last 2 days.');
  });

  it('counts a streak of days in a row, ending yesterday, broken by a gap, an over day, or one not fully counted', () => {
    expect(weekView([past(3, 10), past(2, 10), past(1, 10)], today, settings, now, true).streak).toBe(3);
    expect(weekView([past(3, 10), past(1, 10)], today, settings, now, true).streak).toBe(1);
    expect(weekView([past(2, 10), past(1, 200)], today, settings, now, true).streak).toBe(0);
    expect(weekView([past(2, 10), past(1, 10, { state: 'partly' })], today, settings, now, true).streak).toBe(0);
    // A streak can run back past the seven days shown.
    const long = Array.from({ length: 10 }, (_, i) => past(10 - i, 30));
    const week = weekView(long, today, settings, now, true);
    expect(week.streak).toBe(10);
    expect(weekLine(week)).toBe('Under your goal 6 of the last 6 days, 10 in a row.');
  });

  it('adds up earned time, today included', () => {
    const week = weekView([past(1, 200, { topUps: 2 })], { ...today, topUps: 1 }, settings, now, true);
    expect(week.earned).toBe(3);
    expect(earnedLine(week)).toBe('Earned extra time 3 times this week.');
    expect(earnedLine(weekView([], today, settings, now, true))).toBeNull();
  });

  it('shows today as off or partly counted when it is', () => {
    expect(weekView([], today, settings, now, false).columns[6].state).toBe('off');
    expect(weekView([], { ...today, uncounted: true }, settings, now, true).columns[6].state).toBe('partly');
    expect(weekLine(weekView([], today, settings, now, true))).toBe('Your week fills in as the days go by.');
  });
});
