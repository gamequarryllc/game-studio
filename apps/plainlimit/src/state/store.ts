import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { cellsLeft } from '@/domain/battery';
import { nextRecharge } from '@/domain/day';
import { advance, freshDoc, grantTopUp, isUnlocked, repairDoc, rollOver, withUse, freshDay } from '@/domain/dayState';
import { stepGoal, stepRecharge } from '@/domain/settings';
import type { DayState, Doc, EmptyLevel, Settings } from '@/domain/types';
import * as screenTime from '@/platform/screenTime';
import { readSaved, writeSaved } from '@/platform/storage';

// The one copy of what the app knows, and the only place it changes.

interface Snapshot {
  state: 'loading' | 'ready';
  doc: Doc;
}

let snapshot: Snapshot = { state: 'loading', doc: freshDoc(new Date()) };
const listeners = new Set<() => void>();

function set(doc: Doc, save = true) {
  snapshot = { state: 'ready', doc };
  listeners.forEach((l) => l());
  if (save) void writeSaved(doc);
}

// On a real phone, a change to the settings is handed to Screen Time a moment
// later, so a run of taps on a stepper is one change, not ten.
let replan: ReturnType<typeof setTimeout> | null = null;
function planSoon() {
  if (!screenTime.isOn()) return;
  if (replan) clearTimeout(replan);
  replan = setTimeout(() => {
    replan = null;
    void screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
  }, 600);
}

/**
 * On a real phone, an empty battery locks the settings until it recharges.
 * Otherwise the way round an empty battery would be to nudge the goal up.
 */
export function settingsLocked(doc: Doc = snapshot.doc): boolean {
  return screenTime.isOn() && cellsLeft(doc.day.usedMinutes, doc.settings.goalMinutes) === 0;
}

/** The day as the phone reports it, when the app is counting real screen time. */
function withRealUse(doc: Doc, day: Doc['day']): Doc['day'] {
  if (!screenTime.isOn()) return day;
  const used = screenTime.usedSoFar(doc.settings.goalMinutes, new Date(day.periodStart));
  if (used === null || used === day.usedMinutes) return day;
  return { ...day, usedMinutes: used };
}

// Earned time ends at a time on the clock. The phone is asked to cover the apps
// again at that moment; if the app is open and sees the moment has passed, it
// does so itself, once, in case the phone's timer did not fire.
let coveredAfter: string | null = null;
function coverWhenEarnedTimeIsUp(doc: Doc, now: Date) {
  const { day, settings } = doc;
  if (!screenTime.isOn() || settings.emptyLevel !== 'work' || day.unlockedUntil === null) return;
  if (isUnlocked(day, now) || coveredAfter === day.unlockedUntil) return;
  if (cellsLeft(day.usedMinutes, settings.goalMinutes) !== 0) return;
  coveredAfter = day.unlockedUntil;
  screenTime.coverEmptyNow(settings, day.topUps);
}

/**
 * Whether a day counts as counted: on a phone, only while counting is turned
 * on; in the preview, always (its pretend use is the count).
 */
function counts(watching: boolean | null): boolean {
  return !screenTime.SCREEN_TIME_AVAILABLE || watching === true;
}

/** The phone's own last word on a day that has just ended, if it has one. */
function closingUsed(day: DayState, settings: Settings): number | null {
  if (!screenTime.SCREEN_TIME_AVAILABLE) return null;
  const start = new Date(day.periodStart);
  return screenTime.usedSoFar(settings.goalMinutes, start, nextRecharge(start, settings.rechargeMinute));
}

/** Moves on to the current battery if a recharge has passed, closing the old day into the history. */
function advanced(doc: Doc, now: Date, settings: Settings = doc.settings): Doc {
  const moved = { ...doc, settings };
  if (rollOver(doc.day, now, settings.rechargeMinute) === doc.day) return moved;
  return advance(moved, now, closingUsed(doc.day, doc.settings), counts(doc.watching));
}

/** At most one attempt per launch to register a day the phone has forgotten. */
let reregistered = false;

/**
 * Notes, on the day, anything that means it is not being fully counted, and
 * puts back monitoring the phone has dropped.
 */
function checkHealth(doc: Doc): Doc {
  if (!screenTime.SCREEN_TIME_AVAILABLE) return doc;
  // Counting the phone has registered is counting the person turned on. This is
  // checked every time, not once: right after launch the phone may not yet
  // have said that access is given, and a copy saved by an older build has no
  // record of it. (Build 46 read "off" once at launch and kept it.)
  if (doc.watching !== true && screenTime.isOn()) doc = { ...doc, watching: true };
  if (doc.watching !== true) return doc;
  const state = screenTime.health(doc.settings, new Date(doc.day.periodStart), true);
  if (state === 'notRegistered' && !reregistered) {
    reregistered = true;
    void screenTime.applyPlan(doc.settings, doc.day.topUps).then(() => store.tick(new Date()));
    return doc;
  }
  // While counting works, the floor it has reached is something known for the guard.
  if (state === 'fine') {
    screenTime.noteKnown(doc.settings, doc.day.usedMinutes);
    return doc;
  }
  if (doc.day.uncounted || state === 'nothingPicked') return doc;
  return { ...doc, day: { ...doc.day, uncounted: true } };
}

function withSettings(change: (s: Settings) => Settings) {
  if (settingsLocked()) return;
  // A new recharge time can move the start of the current battery.
  set(advanced(snapshot.doc, new Date(), change(snapshot.doc.settings)));
  planSoon();
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): Snapshot {
    return snapshot;
  },
  async start() {
    if (snapshot.state === 'ready') return;
    const raw = await readSaved();
    const savedWatching = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).watching : undefined;
    // A copy saved before the app kept this: counting is on if the phone has the day registered.
    const watching = typeof savedWatching === 'boolean' ? savedWatching : screenTime.isOn();
    let doc = repairDoc(raw, new Date(), closingUsed, counts(watching));
    if (doc.watching === null) doc = { ...doc, watching };
    doc = checkHealth({ ...doc, day: withRealUse(doc, doc.day) });
    set(doc);
    screenTime.refreshScreens(doc.settings, doc.day.topUps);
    screenTime.onCheckpoint(() => store.tick(new Date()));
    // Coming back to the app is a free moment to bring the battery and the widget up to date.
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      store.tick(new Date());
      if (snapshot.state === 'ready') screenTime.refreshScreens(snapshot.doc.settings, snapshot.doc.day.topUps);
      if (screenTime.isOn()) screenTime.reloadWidget();
    });
  },
  /** Called as time passes: starts a fresh battery once the recharge time has gone by. */
  tick(now: Date) {
    if (snapshot.state !== 'ready') return;
    coverWhenEarnedTimeIsUp(snapshot.doc, now);
    const moved = advanced(snapshot.doc, now);
    const doc = checkHealth({ ...moved, day: withRealUse(moved, moved.day) });
    if (doc.day === snapshot.doc.day && doc.history === snapshot.doc.history) return;
    set(doc);
    // The app has just learned something the widget may not have drawn yet.
    if (screenTime.isOn()) screenTime.reloadWidget();
  },
  /**
   * Asks for Screen Time access and, once given, registers the day with the
   * phone. From then on the battery follows real screen time.
   */
  async turnOnScreenTime(): Promise<'on' | 'denied' | 'failed'> {
    const answer = await screenTime.askPermission();
    if (answer !== 'approved') return 'denied';
    // Counting always takes in the whole day since the recharge, so turning it
    // on at any time picks up what was already used, and off-and-on is no refill.
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
    set({ ...snapshot.doc, watching: ok, day: withRealUse(snapshot.doc, snapshot.doc.day) });
    return ok ? 'on' : 'failed';
  },
  /** How the day's counting stands, for the warning on Today. */
  health(): screenTime.Health {
    const doc = snapshot.doc;
    return screenTime.health(doc.settings, new Date(doc.day.periodStart), doc.watching === true);
  },
  /**
   * Screen Time access came back, or the phone forgot the day: register it
   * again, keeping the day's count. Asks for access first if it is missing.
   */
  async resumeCounting(): Promise<'on' | 'denied' | 'failed'> {
    if (screenTime.permission() !== 'approved' && (await screenTime.askPermission()) !== 'approved') return 'denied';
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
    store.tick(new Date());
    return ok ? 'on' : 'failed';
  },
  /** The phone miscounted: forget its impossible reports and count the day again. */
  async countAgain(): Promise<boolean> {
    const doc = snapshot.doc;
    const ok = await screenTime.countAgain(doc.settings, doc.day.topUps, new Date(doc.day.periodStart));
    store.tick(new Date());
    return ok;
  },
  /** The first-run setup is finished. */
  finishSetup() {
    set({ ...snapshot.doc, setupDone: true });
  },
  /**
   * Setup's last screen: register the day, taking in everything since the
   * recharge, with the locks held so nothing can lock before the person has
   * seen the starting figure. The figure arrives as the phone reports.
   */
  async previewCounting(): Promise<boolean> {
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps, false, true);
    store.tick(new Date());
    return ok;
  },
  /** The starting figure looked right: counting is on, and the locks act from now. */
  startCounting() {
    const doc = snapshot.doc;
    screenTime.releaseLocks(doc.settings, doc.day.topUps, doc.day.usedMinutes);
    set({ ...doc, watching: true, setupDone: true });
  },
  /** The starting figure looked wrong: count from this moment instead, from zero. */
  async countFromNow(): Promise<boolean> {
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps, true);
    set({ ...snapshot.doc, watching: ok, setupDone: true, day: { ...snapshot.doc.day, usedMinutes: 0 } });
    store.tick(new Date());
    return ok;
  },
  /**
   * Developer, on a real phone: a full battery and a count that starts again
   * from now, with every cover taken away. For trying the app without waiting
   * for the recharge time.
   */
  async startDayOver() {
    const now = new Date();
    const day = freshDay(now, snapshot.doc.settings.rechargeMinute);
    // The fresh day first: while the phone is being told, nothing may act on the old one.
    set({ ...snapshot.doc, day });
    await screenTime.applyPlan(snapshot.doc.settings, 0, true);
    set({ ...snapshot.doc, day: withRealUse(snapshot.doc, snapshot.doc.day) });
  },
  turnOffScreenTime() {
    screenTime.turnOff();
    // The rest of today is not counted, and the week view says so.
    set({ ...snapshot.doc, watching: false, day: { ...snapshot.doc.day, uncounted: true } });
  },
  /** The person changed their picks in Apple's list: tell the phone, and redraw. */
  picksChanged() {
    planSoon();
    set({ ...snapshot.doc }, false);
  },
  stepGoal(direction: 1 | -1) {
    withSettings((s) => ({ ...s, goalMinutes: stepGoal(s.goalMinutes, direction) }));
  },
  stepRecharge(direction: 1 | -1) {
    withSettings((s) => ({ ...s, rechargeMinute: stepRecharge(s.rechargeMinute, direction) }));
  },
  setEmptyLevel(emptyLevel: EmptyLevel) {
    withSettings((s) => ({ ...s, emptyLevel }));
  },
  /** Developer: pretend this many more minutes were used. */
  pretendUse(minutes: number) {
    set({ ...snapshot.doc, day: withUse(snapshot.doc.day, minutes) });
  },
  /** Developer, preview only: six made-up finished days, to see the week view. */
  pretendWeek() {
    const goal = snapshot.doc.settings.goalMinutes;
    const today = new Date(snapshot.doc.day.periodStart);
    const used = [0.55, 1.1, 0.8, 0.4, 0.95, 0.7];
    const states = ['counted', 'counted', 'partly', 'counted', 'counted', 'counted'] as const;
    const history = used.map((f, i) => ({
      start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i), today.getHours(), today.getMinutes()).toISOString(),
      goalMinutes: goal,
      usedMinutes: Math.round(goal * f),
      topUps: f > 1 ? 2 : 0,
      state: states[i],
    }));
    set({ ...snapshot.doc, history });
  },
  /** Developer: a full battery, as if the recharge time had just passed. */
  rechargeNow() {
    set({ ...snapshot.doc, day: freshDay(new Date(), snapshot.doc.settings.rechargeMinute) });
  },
  /** The puzzle was solved: start (or extend) the earned time. */
  earnTopUp() {
    const now = new Date();
    const day = grantTopUp(snapshot.doc.day, now, snapshot.doc.settings.rechargeMinute);
    set({ ...snapshot.doc, day });
    if (day.unlockedUntil) void screenTime.grantExtraTime(new Date(day.unlockedUntil), snapshot.doc.settings, day.topUps, now);
  },
};

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useDoc(): Doc {
  return useStore().doc;
}

/** The time now, refreshed a few times a minute, which also keeps the battery's day current. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const beat = () => {
      const t = new Date();
      store.tick(t);
      setNow(t);
    };
    beat();
    const id = setInterval(beat, 20000);
    return () => clearInterval(id);
  }, []);
  return now;
}
