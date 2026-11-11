// What the app remembers about the current battery, and how it moves on.

import { nextRecharge, periodStart } from './day';
import { topUpPlan } from './puzzle';
import type { DayState, Doc, Settings } from './types';
import { DEFAULT_SETTINGS, repairSettings } from './settings';

export function freshDay(now: Date, rechargeMinute: number): DayState {
  return { periodStart: periodStart(now, rechargeMinute).toISOString(), usedMinutes: 0, topUps: 0, unlockedUntil: null };
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
  return { v: 1, settings: { ...DEFAULT_SETTINGS, allowed: [...DEFAULT_SETTINGS.allowed] }, day: freshDay(now, DEFAULT_SETTINGS.rechargeMinute) };
}

/** Reads a saved copy from anything at all. Whatever cannot be trusted starts over. */
export function repairDoc(raw: unknown, now: Date): Doc {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const settings: Settings = repairSettings(r.settings);
  const d = (r.day && typeof r.day === 'object' ? r.day : {}) as Record<string, unknown>;
  let day = freshDay(now, settings.rechargeMinute);
  const start = typeof d.periodStart === 'string' ? new Date(d.periodStart) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const used = typeof d.usedMinutes === 'number' && Number.isFinite(d.usedMinutes) ? Math.min(48 * 60, Math.max(0, d.usedMinutes)) : 0;
    const topUps = typeof d.topUps === 'number' && Number.isFinite(d.topUps) ? Math.max(0, Math.floor(d.topUps)) : 0;
    const until = typeof d.unlockedUntil === 'string' && !Number.isNaN(new Date(d.unlockedUntil).getTime()) ? d.unlockedUntil : null;
    day = rollOver({ periodStart: start.toISOString(), usedMinutes: used, topUps, unlockedUntil: until }, now, settings.rechargeMinute);
  }
  return { v: 1, settings, day };
}
