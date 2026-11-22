import { sumLevelFor, widgetRecord } from '../pro';
import { DEFAULT_SETTINGS } from '../settings';

describe('what Pro changes', () => {
  it('uses the chosen sums with Pro and normal ones without it', () => {
    const hard = { ...DEFAULT_SETTINGS, sumLevel: 'hard' as const };
    expect(sumLevelFor(hard, true)).toBe('hard');
    expect(sumLevelFor(hard, false)).toBe('normal');
    expect(sumLevelFor({ ...DEFAULT_SETTINGS, sumLevel: undefined }, true)).toBe('normal');
  });
});

describe('the large widget record', () => {
  it('carries the streak, passes, perfect weeks and this week as one letter a day', () => {
    const day = (cell: 'under' | 'ranOut' | 'partly' | 'none' | 'future') => ({ cell, pass: false });
    const view = {
      streakDays: 34,
      bestDays: 41,
      perfectWeeks: 3,
      passes: 2,
      nextPass: new Date(),
      used: [],
      weeks: [{ start: '2026-11-16', perfect: false, days: [day('under'), day('ranOut'), day('partly'), day('none'), day('future'), day('future'), day('future')] }],
    };
    expect(widgetRecord(view, true)).toEqual({ pro: true, streak: 34, passes: 2, perfect: 3, week: 'urpnfff' });
    expect(widgetRecord({ ...view, weeks: [] }, false).week).toBe('fffffff');
  });
});
