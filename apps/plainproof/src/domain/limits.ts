/** The free version holds this many items, with every feature. Pro removes the limit. */
export const FREE_ITEM_LIMIT = 20;

/** `count` is every item the app holds, across all places. */
export function canAddItem(count: number, isPro: boolean): boolean {
  return isPro || count < FREE_ITEM_LIMIT;
}

/** How many more items fit in the free version; null when there is no limit. */
export function freeItemsLeft(count: number, isPro: boolean): number | null {
  if (isPro) return null;
  return Math.max(FREE_ITEM_LIMIT - count, 0);
}
