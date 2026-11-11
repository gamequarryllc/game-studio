import { CELLS, cellsLeft, fractionUsed, wordFor } from '../battery';
import { checkpointsFor, finalWarningMinutes, isPlausible, usedFloor } from '../checkpoints';
import { contrast, oklchToHex, toneAt, toneForCells } from '../tone';

describe('cells', () => {
  it('starts full and empties one cell per sixth of the goal', () => {
    expect(cellsLeft(0, 180)).toBe(6);
    expect(cellsLeft(29, 180)).toBe(6);
    expect(cellsLeft(30, 180)).toBe(5);
    expect(cellsLeft(89, 180)).toBe(4);
    expect(cellsLeft(90, 180)).toBe(3);
    expect(cellsLeft(150, 180)).toBe(1);
    expect(cellsLeft(179, 180)).toBe(1);
    expect(cellsLeft(180, 180)).toBe(0);
    expect(cellsLeft(400, 180)).toBe(0);
  });

  it('works for goals that do not divide evenly by six', () => {
    expect(cellsLeft(0, 100)).toBe(6);
    expect(cellsLeft(16, 100)).toBe(6);
    expect(cellsLeft(17, 100)).toBe(5);
    expect(cellsLeft(99, 100)).toBe(1);
    expect(cellsLeft(100, 100)).toBe(0);
  });

  it('never goes outside 0 to 6, whatever it is given', () => {
    expect(cellsLeft(-50, 180)).toBe(CELLS);
    expect(cellsLeft(10, 0)).toBe(0);
    expect(cellsLeft(10, Number.NaN)).toBe(0);
    expect(fractionUsed(-5, 180)).toBe(0);
    expect(fractionUsed(90, 180)).toBe(0.5);
  });

  it('has a word for every count', () => {
    expect([6, 5, 4, 3, 2, 1, 0].map(wordFor)).toEqual(['Plenty left', 'Plenty left', 'Plenty left', 'Half gone', 'Getting low', 'Nearly out', 'Empty']);
  });
});

describe('colour', () => {
  it('converts known OKLCH colours', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#FFFFFF');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    // sRGB red is oklch(62.8% 0.2577 29.23)
    expect(oklchToHex(0.628, 0.2577, 29.23)).toMatch(/^#F[EF]0[0-4]0[0-4]$/);
  });

  it('gives text that can be read at every point of the day', () => {
    for (let t = 0; t <= 1.2; t += 0.01) {
      const tone = toneAt(t);
      expect(tone.bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(tone.bg, tone.fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is deep red and light-on-dark only once the battery is empty', () => {
    expect(toneAt(0.99).dark).toBe(false);
    expect(toneAt(1).dark).toBe(true);
    expect(toneAt(Number.NaN).dark).toBe(true);
    expect(toneForCells(0).bg).toBe(toneAt(1).bg);
  });

  it('gives each cell count its own colour, getting no lighter than yellow before turning red', () => {
    const colours = [6, 5, 4, 3, 2, 1, 0].map((n) => toneForCells(n).bg);
    expect(new Set(colours).size).toBe(7);
  });
});

describe('checkpoints', () => {
  it('asks about each cell, a last warning, and empty, in order', () => {
    const list = checkpointsFor(180);
    expect(list.map((c) => c.id)).toEqual(['cell-1', 'cell-2', 'cell-3', 'cell-4', 'cell-5', 'final-warning', 'empty']);
    expect(list.map((c) => c.minutes)).toEqual([30, 60, 90, 120, 150, 170, 180]);
    expect(list.filter((c) => c.effect === 'warning').map((c) => c.id)).toEqual(['cell-5', 'final-warning']);
  });

  it('keeps the last warning inside the last cell, even for a short goal', () => {
    for (const goal of [30, 45, 60, 100, 180, 240, 720]) {
      const list = checkpointsFor(goal);
      const final = list.find((c) => c.id === 'final-warning')!;
      const lastCell = list.find((c) => c.id === 'cell-5')!;
      expect(finalWarningMinutes(goal)).toBeGreaterThanOrEqual(5);
      expect(final.minutes).toBeGreaterThanOrEqual(lastCell.minutes);
      expect(final.minutes).toBeLessThan(goal);
    }
  });

  it('throws away a checkpoint that arrives sooner than it possibly could', () => {
    const start = new Date(2026, 10, 11, 6, 0);
    const empty = checkpointsFor(180).find((c) => c.id === 'empty')!;
    expect(isPlausible(empty, start, new Date(2026, 10, 11, 6, 0, 20))).toBe(false);
    expect(isPlausible(empty, start, new Date(2026, 10, 11, 8, 30))).toBe(false);
    expect(isPlausible(empty, start, new Date(2026, 10, 11, 8, 58))).toBe(true);
    expect(isPlausible(empty, start, new Date(2026, 10, 11, 21, 0))).toBe(true);
    expect(isPlausible(empty, start, new Date(2026, 10, 11, 5, 0))).toBe(false);
  });

  it('knows the most minutes that have plausibly been used', () => {
    const list = checkpointsFor(180);
    expect(usedFloor([])).toBe(0);
    expect(usedFloor([list[0], list[2], list[1]])).toBe(90);
  });
});
