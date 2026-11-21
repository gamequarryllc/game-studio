import { LIMITS } from './types';

/**
 * The free version holds this many places, each with all its notes. Twenty-five
 * is a couple of years of trips worth pinning for most people; Pro removes the limit.
 */
export const FREE_PLACE_LIMIT = 25;

/** Photos on one place in the free version. Pro raises it to LIMITS.photos. */
export const FREE_PHOTO_LIMIT = 6;

export function canAddPlace(count: number, isPro: boolean): boolean {
  return isPro ? count < LIMITS.places : count < FREE_PLACE_LIMIT;
}

/** How many more places fit in the free version; null when there is no limit. */
export function freePlacesLeft(count: number, isPro: boolean): number | null {
  if (isPro) return null;
  return Math.max(FREE_PLACE_LIMIT - count, 0);
}

export function photoLimit(isPro: boolean): number {
  return isPro ? LIMITS.photos : FREE_PHOTO_LIMIT;
}

/** How many more photos a place with `count` can take. */
export function photoRoom(count: number, isPro: boolean): number {
  return Math.max(photoLimit(isPro) - count, 0);
}
