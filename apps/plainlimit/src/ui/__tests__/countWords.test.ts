import { essentialsValue, keptWords, shownWords, tooManyKept } from '../countWords';

describe('essentialsValue', () => {
  it('names how many essentials are ticked', () => {
    expect(essentialsValue(120, 14)).toBe('14 apps');
    expect(essentialsValue(120, 1)).toBe('1 app');
    expect(essentialsValue(120, 0)).toBe('None');
  });
  it('names how many picks count for a list from an older version, never a bare "Set"', () => {
    expect(essentialsValue(13)).toBe('13 count');
    expect(essentialsValue(1)).toBe('1 count');
  });
  it('says when nothing is chosen, and when the phone has no picker', () => {
    expect(essentialsValue(0)).toBe('Not chosen');
    expect(essentialsValue(-1)).toBe('Your picks');
    expect(essentialsValue(-1, 3)).toBe('Your picks');
  });
});

describe('the two steps', () => {
  it('says how many apps were found, and how many stay free', () => {
    expect(shownWords(120)).toBe('120 apps found.');
    expect(shownWords(1)).toBe('1 app found.');
    expect(keptWords(14)).toContain('14 essentials stay free');
    expect(keptWords(1)).toContain('1 essential stays free');
    expect(keptWords(0)).toContain('every app counts');
  });
  it('turns down too many essentials with the numbers', () => {
    const line = tooManyKept(63, 50);
    expect(line).toContain('63 apps');
    expect(line).toContain('at most 50');
    expect(line).toContain('wasn’t changed');
  });
});
