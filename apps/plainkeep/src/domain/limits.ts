/**
 * The free version looks after this many things (a home and a car, say), with
 * every job, reminder and log line they need. Pro removes the limit.
 */
export const FREE_THING_LIMIT = 2;

export function canAddThing(count: number, isPro: boolean): boolean {
  return isPro || count < FREE_THING_LIMIT;
}

/** How many more things fit in the free version; null when there is no limit. */
export function freeThingsLeft(count: number, isPro: boolean): number | null {
  if (isPro) return null;
  return Math.max(FREE_THING_LIMIT - count, 0);
}
