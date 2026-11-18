import { essentialsValue } from '../countWords';

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
