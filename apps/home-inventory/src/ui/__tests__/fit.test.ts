import { fitSideBySide } from '../fit';

// The folder card's two meters, "Photographed 31 of 37" and "Valued 35 of 37".
const meters = (photographed: string, valued: string) => [['Photographed', photographed], ['Valued', valued]] as const;

/** The room inside the folder on a phone this wide: side margins of 20, padding of 16. */
const inside = (screen: number) => screen - 2 * 20 - 2 * 16;

describe('the folder’s meters', () => {
  it('sit side by side on an ordinary phone with everyday counts', () => {
    expect(fitSideBySide(meters('5 of 6', '5 of 6'), inside(393), 16)).toBe(true);
    expect(fitSideBySide(meters('31 of 37', '35 of 37'), inside(393), 16)).toBe(true);
    expect(fitSideBySide(meters('4 of 5', '4 of 5'), inside(375), 16)).toBe(true);
  });

  it('stack when the counts get long (the label used to run into the number)', () => {
    expect(fitSideBySide(meters('587 of 645', '645 of 645'), inside(393), 16)).toBe(false);
    expect(fitSideBySide(meters('31 of 37', '35 of 37'), inside(375) - 16, 16)).toBe(false);
  });

  it('stack on a narrow or zoomed screen, and when the text size is turned up', () => {
    expect(fitSideBySide(meters('5 of 6', '5 of 6'), inside(320), 16)).toBe(false);
    expect(fitSideBySide(meters('5 of 6', '5 of 6'), inside(393), 16, 1.35)).toBe(false);
  });

  it('has nothing to complain about when there is nothing to show', () => {
    expect(fitSideBySide([], 0, 16)).toBe(true);
  });
});
