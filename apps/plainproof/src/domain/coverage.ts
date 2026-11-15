import { itemTotalCents, unitCents } from './selectors';
import { CATEGORIES, type Category, type Doc, type Item } from './types';

// Is the policy enough for what is here? Compares the inventory with the
// limits the person typed in from their policy. Nothing here is advice: it
// points at numbers worth asking the insurer about.

/**
 * Kinds of things standard home policies often cover only up to a lower
 * amount, most of all for theft, unless each item is listed on the policy
 * ("scheduled"). Shown as a hint when no limit has been typed in.
 */
export const OFTEN_LIMITED: readonly Category[] = ['jewelry', 'art', 'music', 'sports'];

/** The amount at which a single thing in one of those kinds is worth asking about. */
export const ASK_ABOUT_CENTS = 150_000;

export interface CategoryCoverage {
  category: Category;
  count: number;
  totalCents: number;
  limitCents: number | null;
  /** The category's total is over its limit. */
  over: boolean;
  /** Items that on their own reach the limit (or the ask-about amount when there is no limit). */
  bigItems: Item[];
}

export interface Coverage {
  totalCents: number;
  limitCents: number | null;
  /** Share of the limit the inventory reaches, when there is a limit. */
  share: number | null;
  /** 'over': the inventory is worth more than the limit; 'close': within 80% of it. */
  state: 'unknown' | 'ok' | 'close' | 'over';
  deductibleCents: number | null;
  byCategory: CategoryCoverage[];
  /** Items worth asking the insurer to list on the policy by name. */
  toSchedule: Item[];
}

export function coverage(doc: Doc): Coverage {
  const totalCents = doc.items.reduce((n, i) => n + itemTotalCents(i), 0);
  const limit = doc.policy.contentsLimitCents;
  const share = limit && limit > 0 ? totalCents / limit : null;
  const state: Coverage['state'] = share === null ? 'unknown' : share > 1 ? 'over' : share >= 0.8 ? 'close' : 'ok';

  const byCategory: CategoryCoverage[] = [];
  const toSchedule: Item[] = [];
  for (const category of [...CATEGORIES, null] as (Category | null)[]) {
    const items = doc.items.filter((i) => i.category === category);
    if (items.length === 0 || category === null) continue;
    const total = items.reduce((n, i) => n + itemTotalCents(i), 0);
    const limitCents = doc.policy.categoryLimits[category] ?? null;
    const threshold = limitCents ?? (OFTEN_LIMITED.includes(category) ? ASK_ABOUT_CENTS : null);
    const bigItems = threshold === null ? [] : items.filter((i) => (unitCents(i) ?? 0) >= threshold);
    toSchedule.push(...bigItems);
    byCategory.push({ category, count: items.length, totalCents: total, limitCents, over: limitCents !== null && total > limitCents, bigItems });
  }
  byCategory.sort((a, b) => b.totalCents - a.totalCents);
  toSchedule.sort((a, b) => (unitCents(b) ?? 0) - (unitCents(a) ?? 0));
  return { totalCents, limitCents: limit, share, state, deductibleCents: doc.policy.deductibleCents, byCategory, toSchedule };
}
