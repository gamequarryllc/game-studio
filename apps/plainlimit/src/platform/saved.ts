/**
 * Every value Plainlimit keeps in the App Group's shared settings, in one
 * table, with one typed way to read each. The app, its Screen Time extensions
 * and the widget run as separate programs and can only talk through these.
 * (The checkpoint reports themselves are kept by the library, under
 * `events_<activity>_...`, and read with `DeviceActivity.getEvents`.)
 */

import * as DeviceActivity from 'react-native-device-activity';

import { asGuard, GUARD_KEY, type Guard, type Noted } from '@/domain/checkpoints';
import { WIDGET_PLAN_KEY } from '@/domain/monitorPlan';

export const SAVED = {
  /** When counting was started over by the test build ("count from now"); otherwise the day counts from the recharge. */
  countingSince: 'plainlimit_since',
  /** The last known figure: at most this much used by then (see `Noted`). */
  noted: 'plainlimit_known',
  /** The guard against false reports for the latest registration (see `Guard`). Read by the widget too. */
  guard: GUARD_KEY,
  /** When the day was last registered with the phone, and with which goal. */
  registeredAt: 'plainlimit_registered_at',
  registeredGoal: 'plainlimit_registered_goal',
  /** The recharge time the day was last registered with. Missing for a registration made before it was kept. */
  registeredRecharge: 'plainlimit_registered_recharge',
  /** Locks held back until then: setup holds them while it shows the starting figure. */
  holdUntil: 'plainlimit_hold_until',
  /** Earned time (or an emergency pass) runs until then: nothing the phone reports covers an app before it (see `grantExtraTime`). */
  earnedUntil: 'plainlimit_earned_until',
  /** When the ticked apps last changed, and the list as it was when Apple's picker opened. */
  picksChangedAt: 'plainlimit_picks_changed_at',
  picksBefore: 'plainlimit_picks_before',
  /** When the essentials were last chosen (0: never, so the older single list still applies), and the two lists as they were when Apple's picker opened. */
  essentialsSet: 'plainlimit_essentials_set',
  essentialsBefore: 'plainlimit_essentials_before',
  appsBefore: 'plainlimit_apps_before',
  /** The current round of checkpoint names, the one before it, and the goal that one was made for (see `roundName`). */
  round: 'plainlimit_round',
  roundBefore: 'plainlimit_round_before',
  roundGoalBefore: 'plainlimit_round_goal_before',
  /** While the Ask first list is open after a sum: until then (see askFirst.ts). */
  askOpenUntil: 'plainlimit_ask_open_until',
  /** 1 while that open stretch is "Until I leave it": the phone covers the list again by itself once it goes unused. */
  askOpenInUse: 'plainlimit_ask_open_in_use',
  /** The battery (its start, in ms) for which the app last counted again by itself after a miscount: once a battery. */
  recountedFor: 'plainlimit_recounted_for',
  /** When counting was first seen not working, in a run of bad checks. */
  wrongSince: 'plainlimit_wrong_since',
  /** What the widget draws from: the goal, the recharge, when counting began, and the rounds. */
  widgetPlan: WIDGET_PLAN_KEY,
  /** What the large widget draws besides the battery, and whether Pro is held (see `WidgetRecord`). */
  widgetRecord: 'plainlimit_record',
  /** Records for the test build's readout. */
  historyLog: 'plainlimit_history_log',
  problem: 'plainlimit_problem',
  /** Written by the monitor extension and the widget; the app only reads them for the readout. */
  reloadAsked: 'plainlimit_reload_asked',
  widgetCells: 'plainlimit_widget_cells',
  widgetDrew: 'plainlimit_widget_drew',
} as const;

export type Saved = keyof typeof SAVED;

function get(key: Saved): unknown {
  try {
    return DeviceActivity.userDefaultsGet<unknown>(SAVED[key]);
  } catch {
    return undefined;
  }
}

/** A saved number, or 0 if there is none. */
export function readNumber(key: Saved): number {
  const value = get(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A saved number, or null if there is none (for values where 0 means something, like midnight). */
export function readNumberOrNull(key: Saved): number | null {
  const value = get(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A saved string, or '' if there is none. */
export function readString(key: Saved): string {
  const value = get(key);
  return typeof value === 'string' ? value : '';
}

/** A saved list of strings, or none. */
export function readLines(key: Saved): string[] {
  const value = get(key);
  return Array.isArray(value) ? value.filter((l): l is string => typeof l === 'string') : [];
}

/** Saves a value. Throws if the phone refuses, so the caller can note it. */
export function save(key: Saved, value: unknown): void {
  DeviceActivity.userDefaultsSet(SAVED[key], value);
}

/** Forgets a value. Throws if the phone refuses. */
export function forget(key: Saved): void {
  DeviceActivity.userDefaultsRemove(SAVED[key]);
}

export function countingSince(): number | null {
  const at = readNumber('countingSince');
  return at > 0 ? at : null;
}

export function noted(): Noted | null {
  const value = get('noted') as Partial<Noted> | undefined;
  return value && typeof value.at === 'number' && typeof value.most === 'number' ? { at: value.at, most: value.most } : null;
}

export function savedGuard(): Guard | null {
  return asGuard(get('guard'));
}

export const registeredAt = () => readNumber('registeredAt');
export const holdUntil = () => readNumber('holdUntil');
export const earnedUntil = () => readNumber('earnedUntil');
export const picksChangedAt = () => readNumber('picksChangedAt');
export const round = () => readString('round');
