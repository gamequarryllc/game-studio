// The sizes of the icon grid on the Essentials screen (AppIcons.tsx), kept apart so tests need no phone.

/** Space between the rows. Across, the icons spread to fill the width. */
export const GAP = 12;
/** Space kept between icons across, at the least, when working out their size. */
const MIN_ACROSS = 10;

/** How big each icon is on a row `width` wide with `columns` to a row. */
export function iconSize(width: number, columns: number, largest = 52): number {
  if (width <= 0) return 0;
  return Math.max(28, Math.min(largest, Math.floor((width - MIN_ACROSS * (columns - 1)) / columns)));
}

/** How many squares are drawn: all of them, or `limit` with the last one "+N". */
export function squares(count: number, limit: number): number {
  return limit > 0 ? Math.min(count, limit) : count;
}

/** The grid's height for `count` icons. */
export function gridHeight(count: number, columns: number, size: number, limit = 0): number {
  const rows = Math.ceil(squares(count, limit) / columns);
  return rows === 0 ? 0 : rows * size + (rows - 1) * GAP;
}
