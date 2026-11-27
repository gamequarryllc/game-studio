import { CHOOSE_HOW, OTHERS_LABEL, essentialsLabel, essentialsValue, joinsLabel, joinsLine, joinsShort, joinsTitle, tooManyKept } from '../countWords';
import { gridHeight, iconSize, squares } from '../iconGrid';

describe('essentialsValue', () => {
  it('names how many essentials are ticked', () => {
    expect(essentialsValue(14)).toBe('14 apps');
    expect(essentialsValue(1)).toBe('1 app');
    expect(essentialsValue(0)).toBe('None');
  });
  it('says when they are not chosen yet, and when the phone has no picker', () => {
    expect(essentialsValue(null)).toBe('Not chosen');
    expect(essentialsValue(null, false)).toBe('Your picks');
    expect(essentialsValue(3, false)).toBe('Your picks');
  });
});

describe('choosing the essentials', () => {
  it('reads out how many essentials there are, and that everything else uses the battery', () => {
    expect(essentialsLabel(18)).toBe('Always open: 18 essential apps, never counted.');
    expect(essentialsLabel(1)).toBe('Always open: 1 essential app, never counted.');
    expect(essentialsLabel(0)).toBe('Always open: no essentials yet.');
    expect(OTHERS_LABEL).toBe('Everything else uses your battery.');
    // Apple's list opens once, for the essentials alone: nothing asks for "All Apps" any more.
    expect(CHOOSE_HOW).not.toMatch(/All Apps|twice/);
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

describe('new essentials that wait for the recharge', () => {
  it('names the day they start, or the time when the recharge is today\'s', () => {
    expect(joinsTitle('tomorrow', '6:00 AM')).toBe('Joining tomorrow');
    expect(joinsTitle('today', '6:00 AM')).toBe('Joining at 6:00 AM');
    expect(joinsTitle('Friday', '8:00 AM')).toBe('Joining on Friday');
  });

  it('says they are counted until then', () => {
    expect(joinsLine('tomorrow', '6:00 AM')).toBe('Counted until 6:00 AM');
    expect(joinsLine('today', '6:00 AM')).toBe('Counted until then');
  });

  it('reads the card out in full', () => {
    expect(joinsLabel(1, 'tomorrow', '6:00 AM')).toBe('1 app becomes an essential tomorrow at 6:00 AM. It is counted until then.');
    expect(joinsLabel(3, 'today', '6:00 AM')).toBe('3 apps become essentials at 6:00 AM. They are counted until then.');
    expect(joinsLabel(2, 'Friday', '8:00 AM')).toBe('2 apps become essentials on Friday at 8:00 AM. They are counted until then.');
  });

  it('is short on the Settings row', () => {
    expect(joinsShort(2, 'tomorrow', '6:00 AM')).toBe('2 more tomorrow');
    expect(joinsShort(1, 'today', '6:00 AM')).toBe('1 more at 6:00 AM');
    expect(joinsShort(1, 'Friday', '8:00 AM')).toBe('1 more on Friday');
  });
});
