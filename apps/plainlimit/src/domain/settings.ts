// The handful of choices a person makes, their limits, and how a saved copy
// is read back without trusting it.

import { wrapMinute } from './day';
import type { CountMode, EmptyLevel, Settings } from './types';

export const GOAL_MIN = 30;
export const GOAL_MAX = 12 * 60;
export const GOAL_STEP = 15;
export const RECHARGE_STEP = 30;
export const ALLOWED_MAX = 12;

export const DEFAULT_SETTINGS: Settings = {
  goalMinutes: 180,
  rechargeMinute: 6 * 60,
  countMode: 'everything',
  emptyLevel: 'work',
  allowed: ['Phone', 'Messages', 'Maps'],
};

export function clampGoal(minutes: number): number {
  const stepped = Math.round(minutes / GOAL_STEP) * GOAL_STEP;
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, stepped));
}

/** One step up or down from a goal, staying inside the limits. */
export function stepGoal(goalMinutes: number, direction: 1 | -1): number {
  return clampGoal(goalMinutes + direction * GOAL_STEP);
}

/** One step later or earlier for the recharge time, wrapping past midnight. */
export function stepRecharge(rechargeMinute: number, direction: 1 | -1): number {
  return wrapMinute(rechargeMinute + direction * RECHARGE_STEP);
}

const COUNT_MODES: readonly CountMode[] = ['everything', 'timeWasters', 'custom'];
const EMPTY_LEVELS: readonly EmptyLevel[] = ['warn', 'work', 'locked'];

/** Tidies a name typed for the always-allowed list; empty when there is nothing usable. */
export function cleanAppName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Adds a name to the always-allowed list, once, up to the limit. */
export function withAllowed(allowed: readonly string[], name: string): string[] {
  const clean = cleanAppName(name);
  if (!clean) return [...allowed];
  if (allowed.some((a) => a.toLowerCase() === clean.toLowerCase())) return [...allowed];
  if (allowed.length >= ALLOWED_MAX) return [...allowed];
  return [...allowed, clean];
}

export function withoutAllowed(allowed: readonly string[], name: string): string[] {
  return allowed.filter((a) => a !== name);
}

/** Reads settings from anything at all, keeping what is valid and defaulting the rest. */
export function repairSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const goal = typeof r.goalMinutes === 'number' && Number.isFinite(r.goalMinutes) ? clampGoal(r.goalMinutes) : DEFAULT_SETTINGS.goalMinutes;
  const recharge = typeof r.rechargeMinute === 'number' && Number.isFinite(r.rechargeMinute) ? wrapMinute(r.rechargeMinute) : DEFAULT_SETTINGS.rechargeMinute;
  const countMode = COUNT_MODES.includes(r.countMode as CountMode) ? (r.countMode as CountMode) : DEFAULT_SETTINGS.countMode;
  const emptyLevel = EMPTY_LEVELS.includes(r.emptyLevel as EmptyLevel) ? (r.emptyLevel as EmptyLevel) : DEFAULT_SETTINGS.emptyLevel;
  let allowed = DEFAULT_SETTINGS.allowed;
  if (Array.isArray(r.allowed)) {
    allowed = [];
    for (const item of r.allowed) {
      if (typeof item === 'string') allowed = withAllowed(allowed, item);
    }
  }
  return { goalMinutes: goal, rechargeMinute: recharge, countMode, emptyLevel, allowed };
}
