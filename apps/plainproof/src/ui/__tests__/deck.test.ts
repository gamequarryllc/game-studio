import { DECK_STEP, deckLayout } from '../RoomDeck';

describe('the drawer of folders', () => {
  it('shows as many folders behind the front one as the height allows, never fewer than one or more than four', () => {
    expect(deckLayout(170).behind).toBe(1);
    expect(deckLayout(210).behind).toBe(2);
    expect(deckLayout(300).behind).toBe(4);
    expect(deckLayout(900).behind).toBe(4);
  });

  it('keeps the tabs far enough apart to read and close enough to look like one drawer', () => {
    for (const height of [150, 170, 200, 240, 280, 320, 400, 600]) {
      const { behind, gap } = deckLayout(height);
      expect(gap).toBeGreaterThanOrEqual(24);
      expect(gap).toBeLessThanOrEqual(46);
      expect(behind).toBeGreaterThanOrEqual(1);
    }
  });

  it('moves one folder for a comfortable length of swipe', () => {
    expect(DECK_STEP).toBeGreaterThanOrEqual(60);
    expect(DECK_STEP).toBeLessThanOrEqual(110);
  });
});
