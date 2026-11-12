import { yearOf } from './dates';
import type { Doc, Entry, Ymd } from './types';

// Questions the screens ask of the document.

/** The log, newest first. */
export function logNewestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (a.ymd === b.ymd ? b.createdAt - a.createdAt : a.ymd < b.ymd ? 1 : -1));
}

export interface YearGroup {
  year: number;
  entries: Entry[];
  /** What the year's work cost, in cents; null when no line has a cost. */
  spent: number | null;
}

export function sumCost(entries: Entry[]): number | null {
  let any = false;
  let total = 0;
  for (const e of entries) {
    if (e.cost !== null && !e.skipped) {
      any = true;
      total += e.cost;
    }
  }
  return any ? total : null;
}

/** The log by year, newest year and newest line first. */
export function logByYear(entries: Entry[]): YearGroup[] {
  const groups: YearGroup[] = [];
  for (const e of logNewestFirst(entries)) {
    const year = yearOf(e.ymd);
    let g = groups[groups.length - 1];
    if (!g || g.year !== year) {
      g = { year, entries: [], spent: null };
      groups.push(g);
    }
    g.entries.push(e);
  }
  for (const g of groups) g.spent = sumCost(g.entries);
  return groups;
}

export function matchesSearch(entry: Entry, thingName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return `${entry.title}\n${entry.note}\n${thingName}`.toLowerCase().includes(q);
}

/** What was spent on a thing between two days, inclusive. */
export function spentBetween(doc: Doc, thingId: string | null, from: Ymd, to: Ymd): number | null {
  return sumCost(doc.entries.filter((e) => (thingId === null || e.thingId === thingId) && e.ymd >= from && e.ymd <= to));
}
