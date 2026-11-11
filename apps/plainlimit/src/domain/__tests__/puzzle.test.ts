import { isRight, makeRandom, makeSum, makeSums, topUpPlan } from '../puzzle';
import { ALLOWED_MAX, clampGoal, stepGoal, stepRecharge, withAllowed, withoutAllowed } from '../settings';

describe('the puzzle', () => {
  it('costs more and buys less each time', () => {
    expect(topUpPlan(0)).toEqual({ sums: 3, minutes: 15 });
    expect(topUpPlan(1)).toEqual({ sums: 5, minutes: 10 });
    expect(topUpPlan(2)).toEqual({ sums: 7, minutes: 5 });
    expect(topUpPlan(9)).toEqual({ sums: 7, minutes: 5 });
  });

  it('always sets two-digit sums that need a carry', () => {
    const random = makeRandom(42);
    for (let i = 0; i < 2000; i++) {
      const { a, b } = makeSum(random);
      expect(a).toBeGreaterThanOrEqual(12);
      expect(a).toBeLessThanOrEqual(89);
      expect(b).toBeGreaterThanOrEqual(11);
      expect(b).toBeLessThanOrEqual(89);
      expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(10);
    }
  });

  it('sets the same sums for the same seed, and never the same sum twice running', () => {
    expect(makeSums(5, makeRandom(7))).toEqual(makeSums(5, makeRandom(7)));
    const many = makeSums(300, makeRandom(3));
    expect(many).toHaveLength(300);
    for (let i = 1; i < many.length; i++) expect(many[i]).not.toEqual(many[i - 1]);
  });

  it('accepts only the right answer, typed as plain digits', () => {
    const sum = { a: 47, b: 38 };
    expect(isRight(sum, '85')).toBe(true);
    expect(isRight(sum, ' 85 ')).toBe(true);
    expect(isRight(sum, '86')).toBe(false);
    expect(isRight(sum, '')).toBe(false);
    expect(isRight(sum, '85.0')).toBe(false);
    expect(isRight(sum, '8 5')).toBe(false);
    expect(isRight(sum, 'eighty-five')).toBe(false);
    expect(isRight(sum, '0x55')).toBe(false);
    expect(isRight(sum, '00085')).toBe(false);
  });
});

describe('settings', () => {
  it('keeps the goal on quarter hours between half an hour and twelve hours', () => {
    expect(clampGoal(180)).toBe(180);
    expect(clampGoal(7)).toBe(30);
    expect(clampGoal(5000)).toBe(720);
    expect(clampGoal(100)).toBe(105);
    expect(stepGoal(30, -1)).toBe(30);
    expect(stepGoal(180, 1)).toBe(195);
    expect(stepGoal(720, 1)).toBe(720);
  });

  it('moves the recharge time by half hours, around midnight', () => {
    expect(stepRecharge(360, 1)).toBe(390);
    expect(stepRecharge(0, -1)).toBe(1410);
    expect(stepRecharge(1410, 1)).toBe(0);
  });

  it('adds an always-allowed app once, tidied, up to the limit', () => {
    expect(withAllowed(['Phone'], '  Camera   app ')).toEqual(['Phone', 'Camera app']);
    expect(withAllowed(['Phone'], 'PHONE')).toEqual(['Phone']);
    expect(withAllowed(['Phone'], '   ')).toEqual(['Phone']);
    const full = Array.from({ length: ALLOWED_MAX }, (_, i) => `App ${i}`);
    expect(withAllowed(full, 'One more')).toEqual(full);
    expect(withoutAllowed(['Phone', 'Maps'], 'Phone')).toEqual(['Maps']);
  });
});
