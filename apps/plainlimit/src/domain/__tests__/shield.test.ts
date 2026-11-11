import { DEFAULT_SETTINGS } from '../settings';
import { emptyCopy, goalInWords, warningCopy } from '../shield';
import type { Settings } from '../types';

const base: Settings = { ...DEFAULT_SETTINGS };

describe('the screens that cover an app', () => {
  it('says the goal in words', () => {
    expect(goalInWords(180)).toBe('3 hours');
    expect(goalInWords(60)).toBe('1 hour');
    expect(goalInWords(150)).toBe('2 hours 30 minutes');
    expect(goalInWords(45)).toBe('45 minutes');
  });

  it('warns on the last cell with the recharge time', () => {
    const copy = warningCopy({ ...base, rechargeMinute: 7 * 60 + 30 });
    expect(copy.title).toBe('Last cell');
    expect(copy.line).toBe('Your battery is nearly out. It recharges at 7:30 AM.');
    expect([copy.primary, copy.secondary]).toEqual(['Keep going', 'Close this app']);
  });

  it('always makes closing the main button once the battery is empty', () => {
    for (const emptyLevel of ['warn', 'work', 'locked'] as const) {
      expect(emptyCopy({ ...base, emptyLevel }, 0).primary).toBe('Close this app');
    }
  });

  it('lets a warned person through', () => {
    const copy = emptyCopy({ ...base, emptyLevel: 'warn' }, 0);
    expect(copy.line).toBe("You're past your 3 hours. It recharges at 6:00 AM.");
    expect(copy.secondary).toBe('Keep going anyway');
  });

  it('names what the next top-up costs', () => {
    expect(emptyCopy({ ...base, emptyLevel: 'work' }, 0).line).toBe('Solve 3 sums for 15 more minutes, or wait until it recharges at 6:00 AM.');
    expect(emptyCopy({ ...base, emptyLevel: 'work' }, 1).line).toBe('Solve 5 sums for 10 more minutes, or wait until it recharges at 6:00 AM.');
    expect(emptyCopy({ ...base, emptyLevel: 'work' }, 5).secondary).toBe('I need more time');
  });

  it('offers no way through when locked, and says what still opens', () => {
    const copy = emptyCopy({ ...base, emptyLevel: 'locked' }, 0);
    expect(copy.secondary).toBeNull();
    expect(copy.line).toBe('Locked until it recharges at 6:00 AM. Phone, Messages and Maps still open.');
    expect(emptyCopy({ ...base, emptyLevel: 'locked', allowed: ['Phone'] }, 0).line).toBe('Locked until it recharges at 6:00 AM. Phone still opens.');
    expect(emptyCopy({ ...base, emptyLevel: 'locked', allowed: [] }, 0).line).toBe('Locked until it recharges at 6:00 AM.');
  });
});
