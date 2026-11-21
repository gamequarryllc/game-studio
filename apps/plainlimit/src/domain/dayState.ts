// What the app remembers about the current battery, and how it moves on.

import { goalAfterRecharge, repairNextGoal } from './goal';
import { freshRecord, repairRecord } from './record';
import { nextRecharge, periodStart } from './day';
import { topUpPlan } from './puzzle';
import type { DayState, DaySummary, Doc, Settings } from './types';
import { DEFAULT_SETTINGS, clampGoal, repairSettings } from './settings';

export function freshDay(now: Date, rechargeMinute: number): DayState {
  return { periodStart: periodStart(now, rechargeMinute).toISOString(), usedMinutes: 0, topUps: 0, unlockedUntil: null, uncounted: false };
}

/** How many finished days are kept: eight weeks. */
// Fourteen weeks: the record shows the last twelve, day by day (record.ts).
export const HISTORY_DAYS = 98;

/**
 * Moves the document on to the current battery if a recharge has passed,
 * keeping a summary of the day that ended. `closingUsed` is the phone's own
 * last word on that day, when it has one; the larger of it and what the app
 * last knew is kept. Days in between that the app never saw are not made up.
 * A higher goal chosen during the day that ended starts now (goal.ts).
 */
export function advance(doc: Doc, now: Date, closingUsed: number | null = null, counting = doc.watching === true): Doc {
  const fresh = rollOver(doc.day, now, doc.settings.rechargeMinute);
  if (fresh === doc.day) return doc;
  const old = doc.day;
  const next = goalAfterRecharge(old, doc.settings, now);
  const day: DayState = { ...fresh, ...next.day };
  const summary: DaySummary = {
    start: old.periodStart,
    goalMinutes: doc.settings.goalMinutes,
    usedMinutes: Math.max(old.usedMinutes, closingUsed ?? 0),
    topUps: old.topUps,
    state: !counting ? 'off' : old.uncounted ? 'partly' : 'counted',
  };
  const history = [...doc.history.filter((h) => h.start !== summary.start), summary].slice(-HISTORY_DAYS);
  return { ...doc, settings: next.settings, day, history };
}

/** The same day if its battery is still the current one, a fresh one if a recharge has passed. */
export function rollOver(day: DayState, now: Date, rechargeMinute: number): DayState {
  const current = periodStart(now, rechargeMinute).toISOString();
  if (day.periodStart === current) return day;
  return freshDay(now, rechargeMinute);
}

/** Minutes of use added to the day (never negative, never past two days' worth). */
export function withUse(day: DayState, minutes: number): DayState {
  const used = Math.min(48 * 60, Math.max(0, day.usedMinutes + minutes));
  return { ...day, usedMinutes: used };
}

/** Earned time is running. */
export function isUnlocked(day: DayState, now: Date): boolean {
  return day.unlockedUntil !== null && new Date(day.unlockedUntil).getTime() > now.getTime();
}

/**
 * Grants the next top-up. Earned time never runs past the next recharge, and
 * earning more while some is running adds to the end of it.
 */
export function grantTopUp(day: DayState, now: Date, rechargeMinute: number): DayState {
  const plan = topUpPlan(day.topUps);
  const from = isUnlocked(day, now) ? new Date(day.unlockedUntil as string).getTime() : now.getTime();
  const until = Math.min(from + plan.minutes * 60000, nextRecharge(now, rechargeMinute).getTime());
  return { ...day, topUps: day.topUps + 1, unlockedUntil: new Date(until).toISOString() };
}

export function freshDoc(now: Date): Doc {
  return {
    v: 1,
    settings: { ...DEFAULT_SETTINGS, allowed: [...DEFAULT_SETTINGS.allowed] },
    day: freshDay(now, DEFAULT_SETTINGS.rechargeMinute),
    watching: false,
    setupDone: false,
    history: [],
    record: freshRecord(now),
  };
}

function repairHistory(raw: unknown): DaySummary[] {
  if (!Array.isArray(raw)) return [];
  const out: DaySummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const h = item as Record<string, unknown>;
    const start = typeof h.start === 'string' ? new Date(h.start) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
    const state = h.state === 'counted' || h.state === 'partly' || h.state === 'off' ? h.state : 'off';
    out.push({ start: start.toISOString(), goalMinutes: num(h.goalMinutes, 24 * 60) || 1, usedMinutes: num(h.usedMinutes, 48 * 60), topUps: Math.floor(num(h.topUps, 99)), state });
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out.filter((h, i) => i === 0 || h.start !== out[i - 1].start).slice(-HISTORY_DAYS);
}

/**
 * Reads a saved copy from anything at all. Whatever cannot be trusted starts
 * over. A day whose battery has since been recharged is closed into the
 * history; `closingUsed` may give the phone's own last word on it.
 */
export function repairDoc(raw: unknown, now: Date, closingUsed?: (day: DayState, settings: Settings) => number | null, counting?: boolean): Doc {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let settings: Settings = repairSettings(r.settings);
  const d = (r.day && typeof r.day === 'object' ? r.day : {}) as Record<string, unknown>;
  let day = freshDay(now, settings.rechargeMinute);
  const start = typeof d.periodStart === 'string' ? new Date(d.periodStart) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const used = typeof d.usedMinutes === 'number' && Number.isFinite(d.usedMinutes) ? Math.min(48 * 60, Math.max(0, d.usedMinutes)) : 0;
    const topUps = typeof d.topUps === 'number' && Number.isFinite(d.topUps) ? Math.max(0, Math.floor(d.topUps)) : 0;
    const until = typeof d.unlockedUntil === 'string' && !Number.isNaN(new Date(d.unlockedUntil).getTime()) ? d.unlockedUntil : null;
    day = { periodStart: start.toISOString(), usedMinutes: used, topUps, unlockedUntil: until, uncounted: d.uncounted === true };
    // A copy saved before the goal rule (goal.ts) has no start: today's goal is it.
    const startGoal = typeof d.startGoalMinutes === 'number' && Number.isFinite(d.startGoalMinutes) ? clampGoal(d.startGoalMinutes) : settings.goalMinutes;
    day.startGoalMinutes = Math.max(startGoal, settings.goalMinutes);
    if (d.firstDay === true) day.firstDay = true;
  }
  const savedSettings = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const nextGoal = repairNextGoal(savedSettings.nextGoalMinutes, day, settings);
  if (nextGoal !== undefined) settings = { ...settings, nextGoalMinutes: nextGoal };
  // A copy saved before setup existed belongs to someone already using the app.
  const saved = Boolean(raw && typeof raw === 'object' && r.settings && typeof r.settings === 'object');
  const doc: Doc = {
    v: 1,
    settings,
    day,
    watching: typeof r.watching === 'boolean' ? r.watching : saved ? null : false,
    setupDone: typeof r.setupDone === 'boolean' ? r.setupDone : saved,
    history: repairHistory(r.history),
    record: repairRecord(r.record, now),
  };
  return advance(doc, now, closingUsed ? closingUsed(day, settings) : null, counting ?? doc.watching === true);
}
