import { sumLevelFor } from '../pro';
import { DEFAULT_SETTINGS } from '../settings';

describe('what Pro changes', () => {
  it('uses the chosen sums with Pro and normal ones without it', () => {
    const hard = { ...DEFAULT_SETTINGS, sumLevel: 'hard' as const };
    expect(sumLevelFor(hard, true)).toBe('hard');
    expect(sumLevelFor(hard, false)).toBe('normal');
    expect(sumLevelFor({ ...DEFAULT_SETTINGS, sumLevel: undefined }, true)).toBe('normal');
  });
});
