// The recharge time (Pro), and when a change to it starts.
//
// A new recharge time starts a new battery from that time, so moving it to
// just before now gave a nearly full battery, the same way round the limit
// as raising the goal (goal.ts). So a new time waits for the current battery
// to end, except on setup's own day, when every change starts at once.
//
// The phone counts a day from the last time its recharge time came round, so
// a battery can only start at an occurrence of its recharge time. The switch
// takes the shorter way over:
// - The new time came round late in the ending battery (moved earlier, say
//   6:00 to 4:00): the next battery starts as planned and counts from that
//   time, so the two overlap a little. Stricter, never looser.
// - It came round early in the battery (moved later, say 6:00 to 8:00): the
//   battery runs on to the new time's next one, and its start moves to the
//   new time's last one, which is what the phone counts from once told.

import { nextRecharge, periodStart, wrapMinute } from './day';
import { goalFree, rechargePassed } from './goal';
import { stepRecharge } from './settings';
import type { DayState, Doc, Settings } from './types';

const HALF_DAY_MS = 12 * 3600 * 1000;

/** The recharge time the person has chosen: the one waiting for this battery to end, if any, else today's. */
export function chosenRecharge(settings: Settings): number {
  return settings.nextRechargeMinute ?? settings.rechargeMinute;
}

function withoutNext(settings: Settings): Settings {
  const { nextRechargeMinute: _next, ...rest } = settings;
  return rest;
}

/**
 * The settings with the recharge time set to `minute`. On setup's own day it
 * is today's at once (`now`: the battery and the phone change with it);
 * otherwise it waits for this battery to end, and going back to today's time
 * takes the waiting one away.
 */
export function withRecharge(doc: Doc, minute: number): { settings: Settings; now: boolean } {
  const m = wrapMinute(minute);
  const settings = withoutNext(doc.settings);
  if (goalFree(doc)) return { settings: { ...settings, rechargeMinute: m }, now: true };
  if (m === doc.settings.rechargeMinute) return { settings, now: false };
  return { settings: { ...settings, nextRechargeMinute: m }, now: false };
}

/** One step later or earlier from the chosen recharge time. */
export function stepChosenRecharge(doc: Doc, direction: 1 | -1): { settings: Settings; now: boolean } {
  return withRecharge(doc, stepRecharge(chosenRecharge(doc.settings), direction));
}

/** Whether the new time's `last` occurrence came early enough in the battery started at `start` for it to run on to the next one. */
function runsOn(start: Date, last: Date): boolean {
  const into = last.getTime() - start.getTime();
  return into > 0 && into < HALF_DAY_MS;
}

/** The battery's own recharge minute: a battery starts at it. */
function minuteOf(when: Date): number {
  return wrapMinute(when.getHours() * 60 + when.getMinutes());
}

/** When this battery ends and the next one starts: at its next recharge, or with a new time waiting, as above. */
export function batteryEnd(day: DayState, settings: Settings): Date {
  const start = new Date(day.periodStart);
  const end = nextRecharge(start, minuteOf(start));
  const next = settings.nextRechargeMinute;
  if (next === undefined) return end;
  return runsOn(start, periodStart(end, next)) ? nextRecharge(end, next) : end;
}

/**
 * Once the battery's planned end has passed, a waiting recharge time becomes
 * the recharge time. When the battery runs on (`runsOn`), it is the same
 * battery, with its start moved to the new time's last occurrence; otherwise
 * the caller starts the next battery from the new time as usual.
 */
export function startWaitingRecharge(doc: Doc, now: Date): { doc: Doc; runsOn: boolean } {
  const next = doc.settings.nextRechargeMinute;
  if (next === undefined || !rechargePassed(doc.day, now)) return { doc, runsOn: false };
  const settings: Settings = { ...withoutNext(doc.settings), rechargeMinute: next };
  const last = periodStart(now, next);
  if (runsOn(new Date(doc.day.periodStart), last)) return { doc: { ...doc, settings, day: { ...doc.day, periodStart: last.toISOString() } }, runsOn: true };
  return { doc: { ...doc, settings }, runsOn: false };
}
