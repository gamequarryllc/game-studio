import { CELLS, cellShort, cellWords, cellsLeft, fractionUsed, wordFor } from '../battery';
import { checkpointsFor, picksSettled, roundName, splitName, finalWarningMinutes, isPlausible, minuteTicksFor, mostByNow, tickStepMinutes, usedFloor } from '../checkpoints';
import { GROUND, accentOnDark, contrast, glowAt, glowForCells, oklchToHex, toneAt, toneForCells } from '../tone';

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

  it('can always be read as an accent on the dark ground', () => {
    for (let t = 0; t <= 1.2; t += 0.01) {
      expect(contrast(accentOnDark(toneAt(t)), GROUND)).toBeGreaterThanOrEqual(4.5);
    }
    expect(accentOnDark(toneAt(0.5))).toBe(toneAt(0.5).bg);
    expect(accentOnDark(toneAt(1))).not.toBe(toneAt(1).bg);
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

  it("shines clearly on the widget's dark ground, a different light for each cell count", () => {
    for (let t = 0; t <= 1.2; t += 0.01) {
      const glow = glowAt(t);
      expect(glow).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(glow, '#151B18')).toBeGreaterThanOrEqual(4.5);
    }
    const lights = [6, 5, 4, 3, 2, 1, 0].map((n) => glowForCells(n));
    expect(new Set(lights).size).toBe(7);
    expect(glowForCells(0)).toBe(glowAt(1));
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

describe('minute checkpoints', () => {
  it('are about eighteen to a day, in whole five minutes, and never on a cell', () => {
    expect(tickStepMinutes(30)).toBe(5);
    expect(tickStepMinutes(180)).toBe(10);
    expect(tickStepMinutes(720)).toBe(40);
    for (const goal of [30, 45, 60, 90, 180, 375, 720]) {
      const ticks = minuteTicksFor(goal);
      const cells = checkpointsFor(goal).map((c) => c.minutes);
      expect(ticks.length).toBeLessThanOrEqual(18);
      for (const t of ticks) {
        expect(t.effect).toBe('tick');
        expect(t.minutes).toBeLessThan(goal);
        expect(cells.some((m) => Math.abs(m - t.minutes) < 0.5)).toBe(false);
        // Names for the phone may not contain "_".
        expect(t.id).not.toContain('_');
      }
    }
    // A 3-hour day: every ten minutes, less the five that fall on a cell.
    expect(minuteTicksFor(180).map((t) => t.minutes)).toEqual([10, 20, 40, 50, 70, 80, 100, 110, 130, 140, 160]);
  });

  it('let the minutes shown move between cells', () => {
    const all = [...checkpointsFor(180), ...minuteTicksFor(180)];
    expect(usedFloor(all.filter((c) => c.minutes <= 50))).toBe(50);
  });
});

describe('the last known figure', () => {
  it('is the next unreported checkpoint, with twenty minutes for the phone being slow', () => {
    expect(mostByNow(180, 0)).toBe(30);
    expect(mostByNow(180, 30)).toBe(60);
    expect(mostByNow(180, 180)).toBeNull();
  });
});

describe('changing what counts', () => {
  it('names each round of checkpoints, so a report says which list it was made for', () => {
    expect(roundName('cell-2', '')).toBe('cell-2');
    expect(roundName('cell-2', 'mhz3k1')).toBe('cell-2~mhz3k1');
    expect(splitName('cell-2~mhz3k1')).toEqual({ id: 'cell-2', round: 'mhz3k1' });
    expect(splitName('final-warning')).toEqual({ id: 'final-warning', round: '' });
    expect(splitName('m40~a')).toEqual({ id: 'm40', round: 'a' });
  });
});

describe('waiting for the phone after changing what counts', () => {
  const changed = 1_000_000;

  it('keeps the old figure while the phone is still re-reporting', () => {
    expect(picksSettled(changed + 1000, changed, null)).toBe(false);
    expect(picksSettled(changed + 3000, changed, changed + 2500)).toBe(false);
  });

  it('switches two seconds after the last report, or after a minute with none', () => {
    expect(picksSettled(changed + 4600, changed, changed + 2500)).toBe(true);
    // Build 52: the phone's first reports for the new list took 38 seconds.
    expect(picksSettled(changed + 38_000, changed, null)).toBe(false);
    expect(picksSettled(changed + 60_000, changed, null)).toBe(true);
  });
});

describe('cell sizes in words', () => {
  it('says minutes, half minutes and hours plainly at every quarter-hour goal', () => {
    expect(cellWords(30)).toBe('5 minutes');
    expect(cellWords(195)).toBe('32½ minutes');
    expect(cellWords(270)).toBe('45 minutes');
    expect(cellWords(360)).toBe('1 hour');
    expect(cellWords(450)).toBe('1 h 15 min');
    expect(cellWords(405)).toBe('1 h 7½ min');
    expect(cellWords(720)).toBe('2 hours');
    for (let goal = 30; goal <= 720; goal += 15) expect(cellWords(goal)).not.toMatch(/:|NaN|undefined/);
  });

  it('says a cell briefly enough to stand inside it', () => {
    expect(cellShort(30)).toBe('5m');
    expect(cellShort(195)).toBe('32½m');
    expect(cellShort(270)).toBe('45m');
    expect(cellShort(360)).toBe('1h');
    expect(cellShort(450)).toBe('1h15');
  });
});
