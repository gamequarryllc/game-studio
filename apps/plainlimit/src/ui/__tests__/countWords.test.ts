import { essentialsValue, tooManyWords } from '../countWords';

describe('essentialsValue', () => {
  it('names how many picks count, never a bare "Set"', () => {
    expect(essentialsValue(13)).toBe('13 count');
    expect(essentialsValue(1)).toBe('1 count');
  });
  it('says when nothing is chosen, and when the phone has no picker', () => {
    expect(essentialsValue(0)).toBe('Not chosen');
    expect(essentialsValue(-1)).toBe('Your picks');
  });
});

describe('too many single apps', () => {
  it('says how many, and how it happened', () => {
    const line = tooManyWords(94, 50);
    expect(line).toContain('94 apps are ticked one by one');
    expect(line).toContain('iOS locks at most 50');
  });
});
