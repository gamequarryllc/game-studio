import type { Doc } from './types';

/** The free version holds this many items, with every feature. Pro removes the limit. */
export const FREE_ITEM_LIMIT = 20;

export function canAddItem(doc: Doc, isPro: boolean): boolean {
  return isPro || doc.items.length < FREE_ITEM_LIMIT;
}

/** How many more items fit in the free version; null when there is no limit. */
export function freeItemsLeft(doc: Doc, isPro: boolean): number | null {
  if (isPro) return null;
  return Math.max(FREE_ITEM_LIMIT - doc.items.length, 0);
}
