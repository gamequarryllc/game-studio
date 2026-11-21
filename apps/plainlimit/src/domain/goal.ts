// The daily goal, and when a change to it starts.
//
// Raising the goal while the battery runs low would be a free way round it
// (the owner, 2026-11-21: "if I am almost out of time, I just bump up my
// daily goal"). So within a day the goal can go down at once, and back up
// as far as the goal the day started with, but no higher. A goal above that
// is kept and starts at the next recharge. During setup, and until the first
// recharge after it, every change starts at once, to get a feel for it.
//
// Lowering stops above what is already used. One tap too many would otherwise
// empty the battery, which locks the settings until the recharge, and the
// lowering could not be undone.

import { nextRecharge, wrapMinute } from './day';
import { GOAL_MIN, GOAL_STEP, clampGoal, stepGoal } from './settings';
import type { DayState, Doc, Settings } from './types';

/** Whether a change to the goal starts at once whatever it is: during setup, and on the day it finished. */
export function goalFree(doc: Doc): boolean {
  return !doc.setupDone || doc.day.firstDay === true;
}

/** The most today's goal can be: the goal this battery started with, or today's goal if that is more. */
export function todayCap(day: DayState, settings: Settings): number {
  return Math.max(day.startGoalMinutes ?? settings.goalMinutes, settings.goalMinutes);
}

/** The goal the person has chosen: the one waiting for the next recharge, if any, else today's. */
export function chosenGoal(settings: Settings): number {
  return settings.nextGoalMinutes ?? settings.goalMinutes;
}

/** Settings without a goal waiting for the next recharge. */
function withoutNext(settings: Settings): Settings {
  const { nextGoalMinutes: _next, ...rest } = settings;
  return rest;
}

/**
 * The least today's goal can be lowered to: the first step above what is
 * already used. None during setup (nothing locks before counting starts, and
 * setup's last screen deals with a day already past the goal), and none once
 * the battery is empty, as lowering can't empty it then.
 */
export function todayFloor(doc: Doc): number {
  const used = doc.day.usedMinutes;
  if (!doc.setupDone || used >= doc.settings.goalMinutes) return GOAL_MIN;
  return clampGoal((Math.floor(used / GOAL_STEP) + 1) * GOAL_STEP);
}

/**
 * The document with the goal set to `target`, under the rule above. Lower, or
 * back up to the day's own start: today's goal, at once. Higher than that:
 * today goes back up to the day's start, and `target` waits for the recharge.
 * A lowering stops at `todayFloor`, or does nothing if today is already there.
 */
export function withGoal(doc: Doc, target: number): Doc {
  let goal = clampGoal(target);
  const today = doc.settings.goalMinutes;
  if (goal < today) goal = Math.max(goal, Math.min(todayFloor(doc), today));
  const settings = withoutNext(doc.settings);
  if (goalFree(doc)) return { ...doc, settings: { ...settings, goalMinutes: goal }, day: { ...doc.day, startGoalMinutes: goal } };
  const cap = todayCap(doc.day, doc.settings);
  if (goal <= cap) return { ...doc, settings: { ...settings, goalMinutes: goal } };
  return { ...doc, settings: { ...settings, goalMinutes: cap, nextGoalMinutes: goal } };
}

/** One step up or down from the chosen goal (the stepper in Settings and setup). */
export function stepChosenGoal(doc: Doc, direction: 1 | -1): Doc {
  return withGoal(doc, stepGoal(chosenGoal(doc.settings), direction));
}

/** Whether a step that way changes anything: the stepper's buttons look closed when it wouldn't. */
export function canStepGoal(doc: Doc, direction: 1 | -1): boolean {
  return chosenGoal(stepChosenGoal(doc, direction).settings) !== chosenGoal(doc.settings);
}

/**
 * Whether a new battery is starting because a recharge has really passed,
 * rather than because the recharge time was moved (Pro), which also starts
 * one. A battery starts at its own recharge minute, so the next real recharge
 * is a day on from its start at that same minute.
 */
export function rechargePassed(day: DayState, now: Date): boolean {
  const start = new Date(day.periodStart);
  return now.getTime() >= nextRecharge(start, wrapMinute(start.getHours() * 60 + start.getMinutes())).getTime();
}

/**
 * The settings and the goal-related part of the battery that follows `old`.
 * After a real recharge, a goal waiting for it starts, and the first day's
 * free changes are over. When only the recharge time moved, nothing about the
 * goal changes: the new battery keeps the old one's start and first day.
 */
export function goalAfterRecharge(old: DayState, settings: Settings, now: Date): { settings: Settings; day: Pick<DayState, 'startGoalMinutes' | 'firstDay'> } {
  if (!rechargePassed(old, now)) {
    return { settings, day: { startGoalMinutes: todayCap(old, settings), ...(old.firstDay ? { firstDay: true } : {}) } };
  }
  return goalAtRecharge(settings);
}

/** What a recharge does to the goal: one waiting for it starts, and the new battery starts with it. */
export function goalAtRecharge(settings: Settings): { settings: Settings; day: Pick<DayState, 'startGoalMinutes'> } {
  const goal = chosenGoal(settings);
  return { settings: { ...withoutNext(settings), goalMinutes: goal }, day: { startGoalMinutes: goal } };
}

/** A goal waiting for the next recharge, if it can still be one (above the day's start), read back from a saved copy. */
export function repairNextGoal(raw: unknown, day: DayState, settings: Settings): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const next = clampGoal(raw);
  return next > todayCap(day, settings) ? next : undefined;
}
