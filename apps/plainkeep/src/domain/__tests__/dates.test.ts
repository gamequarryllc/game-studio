import { addDays, addInterval, addMonths, atTime, daysBetween, displayClock, displayYmd, isValidYmd, shortYmd, toYmd, weekdayName } from '../dates';

describe('calendar days', () => {
  it('accepts real days only', () => {
    expect(isValidYmd('2026-02-28')).toBe(true);
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('26-1-1')).toBe(false);
    expect(isValidYmd(20260101)).toBe(false);
  });

  it('counts days across a daylight-saving change as whole days', () => {
    // In the test time zone the clocks go forward on 2026-03-08 and back on 2026-11-01.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds months onto the same day, or the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 3)).toBe('2026-11-30');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-03-15', -4)).toBe('2025-11-15');
    expect(addInterval('2028-02-29', { n: 1, unit: 'year' })).toBe('2029-02-28');
    expect(addInterval('2026-01-10', { n: 2, unit: 'week' })).toBe('2026-01-24');
    expect(addInterval('2026-01-31', { n: 1, unit: 'month' }, 2)).toBe('2026-03-31');
  });

  it('puts a wall-clock time on the right instant either side of a clock change', () => {
    const before = new Date(atTime('2026-03-07', 9, 0));
    const after = new Date(atTime('2026-03-09', 9, 0));
    expect(before.getHours()).toBe(9);
    expect(after.getHours()).toBe(9);
    // Two calendar days apart, but only 47 hours: the reminder still lands at 9.
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(47);
    expect(toYmd(after)).toBe('2026-03-09');
  });

  it('writes dates and times the way the app shows them', () => {
    expect(displayYmd('2027-03-04')).toBe('Mar 4, 2027');
    expect(displayYmd(null)).toBe('');
    expect(shortYmd('2026-12-04', '2026-11-12')).toBe('Dec 4');
    expect(shortYmd('2027-02-04', '2026-11-12')).toBe('Feb 4');
    expect(shortYmd('2028-02-04', '2026-11-12')).toBe('Feb 4, 2028');
    expect(weekdayName('2026-11-12')).toBe('Thursday');
    expect(displayClock(9, 0)).toBe('9:00 AM');
    expect(displayClock(0, 5)).toBe('12:05 AM');
    expect(displayClock(18, 30)).toBe('6:30 PM');
  });
});
