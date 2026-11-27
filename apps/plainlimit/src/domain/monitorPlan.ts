// What the phone is asked to do for a day: when the day starts and ends, which
// totals to report, what to put on screen at each one, and what the buttons on
// those screens do. Everything here is plain data; src/platform/screenTime.ts
// hands it to Apple's Screen Time, and nothing else in the app talks to that.

import { checkpointsFor, guardFrom, minuteTicksFor, type Guard } from './checkpoints';
import { wrapMinute } from './day';
import { topUpPlan } from './puzzle';
import { emptyCopy, warningCopy, type ShieldCopy } from './shield';
import { KEPT_ACTIVITY, OVER_ACTIVITY, keptRungs, overRungs, type Tally } from './tally';
import { toneForCells } from './tone';
import type { Settings } from './types';

/** The name the day's monitoring is registered under. Names must not contain "_". */
export const ACTIVITY = 'plday';
/** The minute checkpoints, registered apart from the day's own (see `minuteTicksFor`). */
export const TICKS_ACTIVITY = 'plmin';
/** The monitoring that covers earned extra time. */
export const TOPUP_ACTIVITY = 'pltop';
/** The shortest stretch of time the phone will agree to watch. */
export const SHORTEST_WATCH_MINUTES = 15;
/** The list of apps a version before the everything timer counted (tally.ts). Kept on the phone, no longer read. */
export const COUNTED_ID = 'counted';
/** What a checkpoint is registered with to count everything: no apps at all (Apple's DeviceActivityEvent then takes in all activity). */
export const EVERYTHING = '';
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

/** `tally`: only once the essentials' minutes are taken off (tally.ts). Without it the action is the checkpoint's own. */
export type PlanAction =
  | { kind: 'cover'; shield: ShieldId; tally?: Tally }
  | { kind: 'notify'; title: string; body: string; route?: string; tally?: Tally };

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
  /**
   * Colours as 0 to 255. The phone lays the background over a dark, blurred
   * view of the app beneath, so it comes out much darker than asked for; the
   * words are therefore always light, and only the icon and the main button
   * carry the colour.
   */
  background: Rgb;
  text: Rgb;
  accent: Rgb;
  button: Rgb;
  buttonText: Rgb;
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
  /** The minute checkpoints, for TICKS_ACTIVITY over the same stretch of day. They carry no actions. */
  ticks: PlanEvent[];
  /** The essentials' own rungs, for KEPT_ACTIVITY (tally.ts). None when there are no essentials. They carry no actions. */
  kept: PlanEvent[];
  /** The everything timer's rungs past the goal, for OVER_ACTIVITY: they lock once the essentials' minutes are taken off. None when there are no essentials. */
  over: PlanEvent[];
  shields: PlanShield[];
  /** For the widget. */
  widget: { goalMinutes: number; rechargeMinute: number; countFrom: number };
}

/**
 * Earned time runs to a time on the clock, and the apps are covered again at
 * that minute whether or not they were used. The phone is asked to watch a
 * stretch of the day that ends then, in the same form as the day itself
 * (hours and minutes, repeating), because that is the form known to work on a
 * real phone. It refuses stretches shorter than a quarter of an hour, so the
 * stretch always starts sixteen minutes before its end, often in the past;
 * only its end matters. It is stopped again when it ends and when the day does.
 */
export function topUpWindow(until: Date): { start: Clock; end: Clock } {
  const end = until.getHours() * 60 + until.getMinutes();
  return { start: clockOf(end - (SHORTEST_WATCH_MINUTES + 1)), end: clockOf(end) };
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

/** The light ink the app uses on its dark ground. */
const LIGHT: Rgb = { red: 244, green: 245, blue: 242 };

/**
 * The phone draws the main button's label much paler than asked for (a deep
 * red came out pink, near-black on orange came out brown), so the label is
 * always the light ink, which cannot get paler, and the button under it is
 * deep enough for that ink to read. The day's orange is too bright as it is.
 */
function deeper(colour: Rgb): Rgb {
  const by = 0.66;
  return { red: Math.round(colour.red * by), green: Math.round(colour.green * by), blue: Math.round(colour.blue * by) };
}

function shieldFor(id: ShieldId, settings: Settings, topUpsSoFar: number): PlanShield {
  if (id === 'warning') {
    const tone = toneForCells(1);
    // "Keep going" takes the screen away; it comes back when the battery is empty.
    return {
      id,
      copy: warningCopy(settings),
      primary: 'uncover',
      secondary: 'close',
      background: rgbOf(tone.bg),
      text: LIGHT,
      accent: rgbOf(tone.bg),
      button: deeper(rgbOf(tone.bg)),
      buttonText: LIGHT,
      icon: 'battery.25percent',
    };
  }
  const tone = toneForCells(0);
  const secondary: ButtonEffect | null = settings.emptyLevel === 'warn' ? 'uncover' : settings.emptyLevel === 'work' ? 'puzzle' : null;
  return { id, copy: emptyCopy(settings, topUpsSoFar), primary: 'close', secondary, background: rgbOf(tone.bg), text: LIGHT, accent: LIGHT, button: rgbOf(tone.bg), buttonText: LIGHT, icon: 'battery.0percent' };
}

/**
 * Sent in place of a checkpoint's own actions when it came faster than the
 * clock allows (`keepsPace`): nothing locked, and the app counts again once
 * it is opened. One notification however many checkpoints came at once.
 */
export const TOO_SOON_NOTICE = {
  id: 'plainlimit-too-soon',
  title: 'Wrong reading caught',
  body: 'Your iPhone counted more time than you used, so nothing locked. Tap to keep counting.',
} as const;

/** The notification that carries someone from the empty screen to the sums. */
export function puzzleNotice(topUpsSoFar: number): { title: string; body: string; route: string } {
  const plan = topUpPlan(topUpsSoFar);
  return { title: 'Earn more time', body: `Tap to solve ${plan.sums} sums for ${plan.minutes} more minutes.`, route: '/puzzle' };
}

/**
 * When today's count began: the last recharge, or, after the test build's
 * "Start the day over", that moment. Counting otherwise always takes in the
 * whole day since the recharge, so turning it on at any time of day picks up
 * what was already used.
 */
export function countStart(periodStart: Date, countingSince: number | null): Date {
  if (countingSince !== null && countingSince > periodStart.getTime()) return new Date(countingSince);
  return periodStart;
}

/**
 * The earliest moment a checkpoint for `minutes` of use can be true: that many
 * minutes after the count began, less a little slack for the two clocks. The
 * phone is told never to act on the checkpoint before this. iOS 26 sometimes
 * reports every checkpoint within seconds of a day being registered, and
 * without this the covering screens went up over a full battery. With it, a
 * checkpoint reported that early does nothing; it is not reported a second
 * time, so the day it happens goes uncounted, which is the better way to fail.
 */
export function earliestTrue(countFrom: Date, minutes: number, slackMinutes = 2): Date {
  return new Date(countFrom.getTime() + Math.max(0, minutes - slackMinutes) * 60000);
}

/**
 * When the phone may first act on a checkpoint for `minutes`: once it can be
 * true counting from the day's start, and while the guard is open after a
 * registration (see `Guard`), once it can be true counting from `guardFrom`.
 * The guard's part never reaches past its close, so a real report that comes
 * later still locks. (Build 72 held the empty battery's lock back until after 9 PM
 * on a figure that was wrong by 6:58 PM.)
 */
export function lockNotBefore(dayStart: Date, guard: Guard | null, minutes: number): Date {
  const plain = earliestTrue(dayStart, minutes).getTime();
  if (!guard) return new Date(plain);
  const guarded = Math.min(earliestTrue(guardFrom(dayStart, guard), minutes).getTime(), guard.closes);
  return new Date(Math.max(plain, guarded));
}

/**
 * Whether the phone should be asked to include use from before now: always,
 * except on a day the test build started over, which counts from that moment.
 */
export function includesEarlierUse(periodStart: Date, countingSince: number | null): boolean {
  return countingSince === null || countingSince <= periodStart.getTime();
}

const NEARLY_OUT = { title: 'Nearly out', body: 'Your battery is about to run out for today.' } as const;

/**
 * `essentials`: some apps are essentials, so what uses the battery is
 * everything less their minutes (tally.ts). Each action then waits until the
 * essentials can have used no more than the room its checkpoint leaves, and
 * the everything timer gets rungs past the goal to lock on. Without
 * essentials the day is the checkpoints alone, as it always was.
 */
export function monitorPlan(settings: Settings, topUpsSoFar = 0, countingSince: number | null = null, essentials = false): MonitorPlan {
  const goal = settings.goalMinutes;
  const checkpoints = checkpointsFor(goal);
  const lastCellAt = Math.max(...checkpoints.filter((c) => c.id.startsWith('cell-')).map((c) => c.minutes));
  const nearAt = checkpoints.find((c) => c.id === 'final-warning')?.minutes ?? goal;
  // On a short day the last warning falls on the last cell, which already brings a screen; one is enough.
  const nearToo = nearAt > lastCellAt;
  /** What a report of `minutes` of everything may do, once the essentials leave room for it: lock at the goal, and before that the two warnings. */
  const tallied = (minutes: number): PlanAction[] => {
    const actions: PlanAction[] = [];
    if (minutes >= goal) actions.push({ kind: 'cover', shield: 'empty', tally: { room: minutes - goal, mark: 'lock', unless: ['lock'] } });
    if (minutes >= lastCellAt) actions.push({ kind: 'cover', shield: 'warning', tally: { room: minutes - lastCellAt, mark: 'warn', unless: ['lock', 'warn'] } });
    if (nearToo && minutes >= nearAt) actions.push({ kind: 'notify', ...NEARLY_OUT, tally: { room: minutes - nearAt, mark: 'near', unless: ['lock', 'near'] } });
    return actions;
  };
  const events: PlanEvent[] = checkpoints.map((checkpoint) => {
    const actions: PlanAction[] = [];
    if (essentials) actions.push(...tallied(checkpoint.minutes));
    else {
      if (checkpoint.effect === 'warning' && checkpoint.id.startsWith('cell-')) actions.push({ kind: 'cover', shield: 'warning' });
      if (checkpoint.id === 'final-warning' && nearToo) actions.push({ kind: 'notify', ...NEARLY_OUT });
      if (checkpoint.effect === 'empty') actions.push({ kind: 'cover', shield: 'empty' });
    }
    return { name: checkpoint.id, after: spanOf(checkpoint.minutes), minutes: checkpoint.minutes, actions };
  });
  return {
    activity: ACTIVITY,
    start: clockOf(settings.rechargeMinute),
    // The day ends a minute before the next one starts, which is also when the screens come off.
    end: clockOf(settings.rechargeMinute - 1),
    events,
    ticks: minuteTicksFor(goal).map((t) => ({ name: t.id, after: spanOf(t.minutes), minutes: t.minutes, actions: [] })),
    kept: essentials ? keptRungs().map((k) => ({ name: k.id, after: spanOf(k.minutes), minutes: k.minutes, actions: [] })) : [],
    over: essentials ? overRungs(goal).map((x) => ({ name: x.id, after: spanOf(x.minutes), minutes: x.minutes, actions: tallied(x.minutes) })) : [],
    shields: [shieldFor('warning', settings, topUpsSoFar), shieldFor('empty', settings, topUpsSoFar)],
    widget: { goalMinutes: goal, rechargeMinute: settings.rechargeMinute, countFrom: countingSince ?? 0 },
  };
}

export { KEPT_ACTIVITY, OVER_ACTIVITY };
