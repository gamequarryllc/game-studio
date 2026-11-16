// The battery itself: six cells that empty as the day's screen time is used.


export const CELLS = 6;

/** How much of the goal is used, from 0 upward (1 = all of it, more = past it). */
export function fractionUsed(usedMinutes: number, goalMinutes: number): number {
  if (!(goalMinutes > 0)) return 1;
  return Math.max(0, usedMinutes) / goalMinutes;
}

/**
 * Cells still lit. A cell goes dark the moment its share of the goal is used,
 * so with a 3-hour goal the first cell empties at exactly 0:30.
 */
export function cellsLeft(usedMinutes: number, goalMinutes: number): number {
  if (!(goalMinutes > 0)) return 0;
  const emptied = Math.floor((Math.max(0, usedMinutes) * CELLS) / goalMinutes);
  return Math.max(0, CELLS - emptied);
}

/** The one word under the battery. It stays true for a whole cell or more, so it is never visibly late. */
export function wordFor(cells: number): string {
  if (cells <= 0) return 'Empty';
  if (cells === 1) return 'Nearly out';
  if (cells === 2) return 'Getting low';
  if (cells === 3) return 'Half gone';
  return 'Plenty left';
}

/** Minutes of one cell. */
export function cellMinutes(goalMinutes: number): number {
  return goalMinutes / CELLS;
}

/** "30 minutes", "17 and a half minutes", "1 hour". */
export function cellWords(goalMinutes: number): string {
  const each = goalMinutes / 6;
  // Goals step by quarter hours, so a cell is always a whole or half minute.
  const minutes = (m: number) => (m === Math.floor(m) ? String(m) : `${Math.floor(m)}½`);
  if (each < 60) return `${minutes(each)} minutes`;
  const hours = Math.floor(each / 60);
  const rest = each - hours * 60;
  if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hours} h ${minutes(rest)} min`;
}
