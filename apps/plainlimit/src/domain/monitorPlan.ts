// What the phone is asked to do for a day: when the day starts and ends, which
// totals to report, what to put on screen at each one, and what the buttons on
// those screens do. Everything here is plain data; src/platform/screenTime.ts
// hands it to Apple's Screen Time, and nothing else in the app talks to that.

import { checkpointsFor } from './checkpoints';
import { wrapMinute } from './day';
import { topUpPlan } from './puzzle';
import { emptyCopy, warningCopy, type ShieldCopy } from './shield';
import { toneForCells } from './tone';
import type { Settings } from './types';

/** The name the day's monitoring is registered under. Names must not contain "_". */
export const ACTIVITY = 'plday';
/** The monitoring that covers earned extra time. */
export const TOPUP_ACTIVITY = 'pltop';
/** The shortest stretch of time the phone will agree to watch. */
export const SHORTEST_WATCH_MINUTES = 15;
/** Apple's picker stores the person's picks under these names; the app never sees the apps themselves. */
export const COUNTED_ID = 'counted';
export const ALLOWED_ID = 'allowed';
/** Where the app leaves the goal and recharge time for the home screen widget. */
export const WIDGET_PLAN_KEY = 'plainlimit_plan';

export interface Clock {
  hour: number;
  minute: number;
}

export interface Span {
  hour: number;
  minute: number;
  second: number;
}

export type ShieldId = 'warning' | 'empty';

export type PlanAction =
  | { kind: 'cover'; shield: ShieldId }
  | { kind: 'notify'; title: string; body: string; route?: string };

/** What a button on a covering screen does. */
export type ButtonEffect = 'close' | 'uncover' | 'puzzle';

export interface PlanEvent {
  name: string;
  /** Use, since the recharge, at which this fires. */
  after: Span;
  minutes: number;
  actions: PlanAction[];
}

export interface PlanShield {
  id: ShieldId;
  copy: ShieldCopy;
  primary: ButtonEffect;
  secondary: ButtonEffect | null;
  /** Background and text colours as 0 to 255. */
  background: Rgb;
  ink: Rgb;
  icon: string;
}

export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

export interface MonitorPlan {
  activity: string;
  start: Clock;
  end: Clock;
  events: PlanEvent[];
  shields: PlanShield[];
  /** True when every app is covered (except the always-allowed); false when only the person's picks are. */
  coverEverything: boolean;
  /** For the widget. */
  widget: { goalMinutes: number; rechargeMinute: number; countFrom: number };
}

export interface ClockToTheSecond {
  hour: number;
  minute: number;
  second: number;
}

function toTheSecond(at: Date): ClockToTheSecond {
  return { hour: at.getHours(), minute: at.getMinutes(), second: at.getSeconds() };
}

/**
 * Earned time runs to a time on the clock, and the apps are covered again at
 * that moment whether or not they were used. The phone is asked to watch a
 * stretch that ends exactly then. It refuses stretches shorter than a quarter
 * of an hour, so for ten or five earned minutes the stretch is given a start
 * in the past; only its end matters.
 */
export function topUpWindow(now: Date, until: Date): { start: ClockToTheSecond; end: ClockToTheSecond } {
  const shortest = SHORTEST_WATCH_MINUTES * 60_000 + 30_000;
  const start = new Date(Math.min(now.getTime(), until.getTime() - shortest));
  return { start: toTheSecond(start), end: toTheSecond(until) };
}

export function clockOf(minuteOfDay: number): Clock {
  const m = wrapMinute(minuteOfDay);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

export function spanOf(minutes: number): Span {
  const seconds = Math.max(1, Math.round(minutes * 60));
  return { hour: Math.floor(seconds / 3600), minute: Math.floor((seconds % 3600) / 60), second: seconds % 60 };
}

export function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 };
}

function shieldFor(id: ShieldId, settings: Settings, topUpsSoFar: number): PlanShield {
  if (id === 'warning') {
    const tone = toneForCells(1);
    // "Keep going" takes the screen away; it comes back when the battery is empty.
    return { id, copy: warningCopy(settings), primary: 'uncover', secondary: 'close', background: rgbOf(tone.bg), ink: rgbOf(tone.fg), icon: 'battery.25percent' };
  }
  const tone = toneForCells(0);
  const secondary: ButtonEffect | null = settings.emptyLevel === 'warn' ? 'uncover' : settings.emptyLevel === 'work' ? 'puzzle' : null;
  return { id, copy: emptyCopy(settings, topUpsSoFar), primary: 'close', secondary, background: rgbOf(tone.bg), ink: rgbOf(tone.fg), icon: 'battery.0percent' };
}

/** The notification that carries someone from the empty screen to the sums. */
export function puzzleNotice(topUpsSoFar: number): { title: string; body: string; route: string } {
  const plan = topUpPlan(topUpsSoFar);
  return { title: 'Earn more time', body: `Tap to solve ${plan.sums} sums for ${plan.minutes} more minutes.`, route: '/puzzle' };
}

/**
 * When today's count began: the last recharge, or the moment counting was
 * turned on (or started over) if that was later. A checkpoint for N minutes
 * cannot honestly arrive sooner than N minutes after this.
 */
export function countStart(periodStart: Date, countingSince: number | null): Date {
  if (countingSince !== null && countingSince > periodStart.getTime()) return new Date(countingSince);
  return periodStart;
}

/**
 * Whether the phone should be asked to include use from before now. Yes on
 * any day that began with counting already on, so a change to the settings
 * keeps the day's use. No on the day counting is turned on (or started over):
 * that day starts from zero, not from whatever was used since the recharge.
 */
export function includesEarlierUse(periodStart: Date, countingSince: number | null): boolean {
  return countingSince === null || countingSince <= periodStart.getTime();
}

export function monitorPlan(settings: Settings, topUpsSoFar = 0, countingSince: number | null = null): MonitorPlan {
  const events: PlanEvent[] = checkpointsFor(settings.goalMinutes).map((checkpoint) => {
    const actions: PlanAction[] = [];
    if (checkpoint.effect === 'warning' && checkpoint.id.startsWith('cell-')) actions.push({ kind: 'cover', shield: 'warning' });
    if (checkpoint.id === 'final-warning') {
      actions.push({ kind: 'notify', title: 'Nearly out', body: 'Your battery is about to run out for today.' });
    }
    if (checkpoint.effect === 'empty') actions.push({ kind: 'cover', shield: 'empty' });
    return { name: checkpoint.id, after: spanOf(checkpoint.minutes), minutes: checkpoint.minutes, actions };
  });
  return {
    activity: ACTIVITY,
    start: clockOf(settings.rechargeMinute),
    // The day ends a minute before the next one starts, which is also when the screens come off.
    end: clockOf(settings.rechargeMinute - 1),
    events,
    shields: [shieldFor('warning', settings, topUpsSoFar), shieldFor('empty', settings, topUpsSoFar)],
    coverEverything: settings.countMode === 'everything',
    widget: { goalMinutes: settings.goalMinutes, rechargeMinute: settings.rechargeMinute, countFrom: countingSince ?? 0 },
  };
}
