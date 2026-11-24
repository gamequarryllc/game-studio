import { PRO_FEATURES, askFirstFor, proStartIndex, sumLevelFor, widgetRecord } from '../pro';
import { DEFAULT_SETTINGS } from '../settings';

describe('what Pro changes', () => {
  it('uses the chosen sums with Pro and normal ones without it', () => {
    const hard = { ...DEFAULT_SETTINGS, sumLevel: 'hard' as const };
    expect(sumLevelFor(hard, true)).toBe('hard');
    expect(sumLevelFor(hard, false)).toBe('normal');
    expect(sumLevelFor({ ...DEFAULT_SETTINGS, sumLevel: undefined }, true)).toBe('normal');
  });

  it('runs Second thought with Pro and not without it, keeping the choices either way', () => {
    const on = { ...DEFAULT_SETTINGS, askFirst: { on: true, openMinutes: 15 as const, whileInUse: false } };
    expect(askFirstFor(on, true)).toEqual({ on: true, openMinutes: 15, whileInUse: false });
    expect(askFirstFor(on, false)).toEqual({ on: false, openMinutes: 15, whileInUse: false });
    expect(askFirstFor({ ...DEFAULT_SETTINGS, askFirst: undefined }, true).on).toBe(false);
  });

  it('lists Second thought among what Pro adds', () => {
    expect(PRO_FEATURES.map((f) => f.title)).toContain('Second thought');
  });

  it('opens the Pro screen on the card a screen asks for, and on the first one otherwise', () => {
    expect(new Set(PRO_FEATURES.map((f) => f.key)).size).toBe(PRO_FEATURES.length);
    expect(PRO_FEATURES[proStartIndex('sums')].key).toBe('sums');
    expect(PRO_FEATURES[proStartIndex('lockMessage')].key).toBe('lockMessage');
    expect(proStartIndex(undefined)).toBe(0);
    expect(proStartIndex('nonsense')).toBe(0);
    expect(proStartIndex(['sums'])).toBe(0);
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
