import { essentialsLabel, essentialsValue, othersLabel, tooManyKept } from '../countWords';
import { gridHeight, iconSize, squares } from '../iconGrid';

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

describe('choosing the essentials', () => {
  it('reads out how many essentials there are, and how many apps use the battery', () => {
    expect(essentialsLabel(18)).toBe('Always open: 18 essential apps, never counted.');
    expect(essentialsLabel(1)).toBe('Always open: 1 essential app, never counted.');
    expect(essentialsLabel(0)).toBe('Always open: no essentials yet.');
    expect(othersLabel(40)).toBe('Everything else: 40 apps use your battery.');
    expect(othersLabel(1)).toBe('Everything else: 1 app uses your battery.');
  });
  it('turns down too many essentials with the numbers', () => {
    const line = tooManyKept(63, 50);
    expect(line).toContain('63 apps');
    expect(line).toContain('at most 50');
    expect(line).toContain('wasn’t changed');
  });
});

describe('the icon grid', () => {
  it('fits six icons across a phone-wide card, no bigger than 52 points', () => {
    expect(iconSize(317, 6)).toBe(44);
    expect(iconSize(800, 6)).toBe(52);
    expect(iconSize(0, 6)).toBe(0);
  });
  it('draws at most the limit, the last square standing for the rest', () => {
    expect(squares(18, 24)).toBe(18);
    expect(squares(50, 24)).toBe(24);
    expect(squares(50, 0)).toBe(50);
  });
  it('is as tall as its rows', () => {
    expect(gridHeight(18, 6, 44)).toBe(3 * 44 + 2 * 12);
    expect(gridHeight(19, 6, 44)).toBe(4 * 44 + 3 * 12);
    expect(gridHeight(50, 6, 44, 24)).toBe(4 * 44 + 3 * 12);
    expect(gridHeight(0, 6, 44)).toBe(0);
  });
});
