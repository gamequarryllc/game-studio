import { stackLayout } from '../RoomDeck';

// The drawer: a column of folders, one of them open. A closed folder takes one step of height, the open one a step
// and the opening, and the column ends a tab below the last folder's top.

describe('the drawer of folders', () => {
  it('shows every folder at once when they fit, and takes no more height than they need', () => {
    const eight = stackLayout(400, 8);
    expect(eight.shift).toBe(0);
    expect(eight.viewport).toBe(eight.total);
    expect(eight.total).toBeLessThanOrEqual(400);
    // A few folders in a tall space sit at a comfortable distance and leave the rest of the space alone.
    const three = stackLayout(500, 3);
    expect(three.step).toBe(46);
    expect(three.viewport).toBeLessThan(300);
    expect(three.shift).toBe(0);
  });

  it('spreads the folders to use the height there is, within what reads well', () => {
    for (const [room, n] of [
      [400, 8],
      [360, 6],
      [520, 10],
      [300, 5],
    ]) {
      const { step, total } = stackLayout(room, n);
      expect(step).toBeGreaterThanOrEqual(30);
      expect(step).toBeLessThanOrEqual(46);
      expect(total).toBeLessThanOrEqual(room);
      expect(Number.isInteger(step)).toBe(true);
    }
  });

  it('keeps folders readable when there are too many to fit, and moves the column by exactly the overflow', () => {
    const many = stackLayout(400, 20);
    expect(many.step).toBe(30);
    expect(many.viewport).toBe(400);
    expect(many.shift).toBe(many.total - 400);
    expect(many.shift).toBeGreaterThan(0);
  });

  it('never collapses, whatever height it is given', () => {
    for (const room of [0, 40, 120]) {
      const { step, viewport } = stackLayout(room, 4);
      expect(step).toBe(30);
      expect(viewport).toBeGreaterThanOrEqual(124);
    }
    expect(stackLayout(400, 0).step).toBeGreaterThanOrEqual(30);
  });
});
