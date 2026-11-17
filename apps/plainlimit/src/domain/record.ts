/**
 * Emergency passes and the record (the owner's rules, 2026-11-17).
 *
 * - One pass is added each week (on Monday); passes bank with no limit.
 * - At most one is used a day (a battery's day, recharge to recharge). A
 *   pass opens everything, settings included, for 15 minutes, in any mode.
 * - The record: weeks without using a pass (and the best run), perfect weeks
 *   (every day under the goal, no pass), the passes in the bank, the last 12
 *   weeks day by day, and when passes were used.
 */

import type { DaySummary } from './types';

export const PASS_MINUTES = 15;
const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;
/** Uses kept: more than enough for the best run and the list. */
const USES_KEPT = 200;

export interface PassRecord {
  /** Passes in the bank. */
  passes: number;
  /** The week the last pass was added, as its Monday (YYYY-MM-DD). */
  lastAdded: string;
  /** When the record began (ISO time). */
  since: string;
  /** When passes were used (ISO times), oldest first. */
  uses: string[];
  /** The running pass ends here (ISO time), or null. */
  passUntil: string | null;
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The Monday of `d`'s week, as YYYY-MM-DD in local time. */
export function weekKey(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(monday);
}

function mondayOf(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** A new record starts with one pass, so there is a way out from the first day. */
export function freshRecord(now: Date): PassRecord {
  return { passes: 1, lastAdded: weekKey(now), since: now.toISOString(), uses: [], passUntil: null };
}

export function repairRecord(raw: unknown, now: Date): PassRecord {
  if (!raw || typeof raw !== 'object') return freshRecord(now);
  const r = raw as Record<string, unknown>;
  const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? v : null);
  return {
    passes: typeof r.passes === 'number' && Number.isFinite(r.passes) ? Math.max(0, Math.floor(r.passes)) : 1,
    lastAdded: typeof r.lastAdded === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastAdded) ? r.lastAdded : weekKey(now),
    since: iso(r.since) ?? now.toISOString(),
    uses: Array.isArray(r.uses) ? r.uses.map(iso).filter((u): u is string => u !== null).sort().slice(-USES_KEPT) : [],
    passUntil: iso(r.passUntil),
  };
}

/** Adds a pass for each Monday that has come since the last one was added. */
export function addWeeklyPasses(r: PassRecord, now: Date): PassRecord {
  const current = weekKey(now);
  if (current <= r.lastAdded) return r;
  const weeks = Math.round((mondayOf(current).getTime() - mondayOf(r.lastAdded).getTime()) / WEEK);
  return weeks > 0 ? { ...r, passes: r.passes + weeks, lastAdded: current } : r;
}

/** When the next pass is added: the coming Monday. */
export function nextPassDate(r: PassRecord): Date {
  const m = mondayOf(r.lastAdded);
  return new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7);
}

export function passActive(r: PassRecord | undefined, now: Date): boolean {
  return !!r?.passUntil && new Date(r.passUntil).getTime() > now.getTime();
}

/** Whether a pass can be used now, in the battery's day that began at `dayStart`. */
export function passCheck(r: PassRecord, dayStart: Date, now: Date): 'ok' | 'none' | 'usedToday' | 'running' {
  if (passActive(r, now)) return 'running';
  if (r.uses.some((u) => new Date(u).getTime() >= dayStart.getTime())) return 'usedToday';
  return r.passes > 0 ? 'ok' : 'none';
}

/** Uses a pass: one out of the bank, open until `now` + 15 minutes, or the recharge if sooner. */
export function spendPass(r: PassRecord, now: Date, nextRechargeMs: number): PassRecord {
  const until = Math.min(now.getTime() + PASS_MINUTES * 60000, nextRechargeMs);
  return { ...r, passes: Math.max(0, r.passes - 1), uses: [...r.uses, now.toISOString()].slice(-USES_KEPT), passUntil: new Date(until).toISOString() };
}

export type Cell = 'under' | 'ranOut' | 'partly' | 'none' | 'future';

export interface RecordView {
  /** Whole weeks since the last pass was used, or since the record began. */
  streakWeeks: number;
  bestWeeks: number;
  /** Finished weeks (Monday to Sunday) with every day counted and under the goal, and no pass. */
  perfectWeeks: number;
  passes: number;
  nextPass: Date;
  /** The last 12 weeks, oldest first, Monday to Sunday; `pass` marks a day a pass was used. */
  weeks: { start: string; perfect: boolean; days: { cell: Cell; pass: boolean }[] }[];
  /** Passes used, newest first. */
  used: Date[];
}

function cellOf(h: DaySummary): Cell {
  if (h.state === 'off') return 'none';
  if (h.usedMinutes >= h.goalMinutes) return 'ranOut';
  return h.state === 'partly' ? 'partly' : 'under';
}

/**
 * The record as the screens show it. `today` is the day so far, which counts
 * once it is over. A pass belongs to the battery's day it was used in: one
 * used at 2 AM, before a 6 AM recharge, marks the day before.
 */
export function recordView(r: PassRecord, history: readonly DaySummary[], today: DaySummary, now: Date, rechargeMinute = 0): RecordView {
  const byDay = new Map<string, Cell>(history.map((h) => [dateKey(new Date(h.start)), cellOf(h)]));
  const batteryDay = (iso: string) => dateKey(new Date(new Date(iso).getTime() - rechargeMinute * 60000));
  const passDays = new Set(r.uses.map(batteryDay));
  const todayKey = dateKey(new Date(today.start));
  const thisMonday = mondayOf(weekKey(now));
  const weeks = Array.from({ length: 12 }, (_, w) => {
    const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * (11 - w));
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d);
      const key = dateKey(date);
      const cell: Cell = key === todayKey ? cellOf(today) : date.getTime() > now.getTime() ? 'future' : byDay.get(key) ?? 'none';
      return { cell, pass: passDays.has(key) };
    });
    const finished = w < 11;
    return { start: dateKey(monday), perfect: finished && days.every((x) => x.cell === 'under' && !x.pass), days };
  });
  // Perfect weeks over all the history kept, not only the 12 shown.
  const kept = new Map<string, DaySummary[]>();
  for (const h of history) {
    const key = weekKey(new Date(h.start));
    kept.set(key, [...(kept.get(key) ?? []), h]);
  }
  let perfectWeeks = 0;
  for (const [key, days] of kept) {
    if (key >= weekKey(now) || days.length < 7) continue;
    if (days.every((h) => cellOf(h) === 'under' && !passDays.has(dateKey(new Date(h.start))))) perfectWeeks += 1;
  }
  const marks = [new Date(r.since).getTime(), ...r.uses.map((u) => new Date(u).getTime()), now.getTime()];
  let bestWeeks = 0;
  for (let i = 1; i < marks.length; i++) bestWeeks = Math.max(bestWeeks, Math.floor((marks[i] - marks[i - 1]) / WEEK));
  const last = marks[marks.length - 2];
  return {
    streakWeeks: Math.max(0, Math.floor((now.getTime() - last) / WEEK)),
    bestWeeks,
    perfectWeeks,
    passes: r.passes,
    nextPass: nextPassDate(r),
    weeks,
    used: r.uses.map((u) => new Date(u)).reverse(),
  };
}
