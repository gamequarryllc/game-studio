import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { DEFAULT_ASK_FIRST, onAfterPicking, type AskFirst } from '@/domain/askFirst';
import { cellsLeft } from '@/domain/battery';
import { widgetRecord } from '@/domain/pro';
import { addWeeklyPasses, freshRecord, passActive, passCheck, recordView, spendPass } from '@/domain/record';
import { clockLabel, nextRecharge } from '@/domain/day';
import { advance, freshDoc, grantTopUp, isUnlocked, repairDoc, rollOver, withUse, freshDay } from '@/domain/dayState';
import { canStepGoal, goalAtRecharge, goalFree, stepChosenGoal } from '@/domain/goal';
import { stepChosenRecharge } from '@/domain/recharge';
import { cleanLockMessage, isLockMessageIdea } from '@/domain/settings';
import type { SumLevel } from '@/domain/puzzle';
import type { DayState, DaySummary, Doc, EmptyLevel, Settings } from '@/domain/types';
import { allowAskFirst, applyAskFirst, openAsk, type AskOpen } from '@/platform/askFirst';
import * as screenTime from '@/platform/screenTime';
import { readSaved, writeSaved } from '@/platform/storage';
import { setupKind } from '@/state/setupKind';

// The one copy of what the app knows, and the only place it changes.

interface Snapshot {
  state: 'loading' | 'ready';
  doc: Doc;
}

let snapshot: Snapshot = { state: 'loading', doc: freshDoc(new Date()) };
const listeners = new Set<() => void>();
/** Records finished days leaving the history, with where the change came from (see screenTime.noteHistoryLoss). */
function noteLoss(starts: string[], how: string) {
  const days = starts.map((s) => new Date(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })).join(', ');
  const from = (new Error().stack ?? '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').slice(0, 40)).join(' < ');
  screenTime.noteHistoryLoss(`lost ${days} in ${how}${from ? ` (${from})` : ''}`);
}

/**
 * Whether the saved copy has been read. Until then the store holds a blank
 * placeholder, and saving it would wipe the history (build 57: Friday's column
 * was gone by evening, cause not yet certain), so nothing is saved before.
 */
let loaded = false;

function set(doc: Doc, save = true) {
  if (!loaded) return;
  if (doc.history !== snapshot.doc.history) {
    const kept = new Set(doc.history.map((h) => h.start));
    const lost = snapshot.doc.history.filter((h) => !kept.has(h.start));
    if (lost.length > 0) noteLoss(lost.map((h) => h.start), 'a change');
  }
  snapshot = { state: 'ready', doc };
  listeners.forEach((l) => l());
  if (save) void writeSaved(doc);
  shareRecord();
}

/** The large widget's streak, passes and week, and whether Pro is held (pro.ts). */
function shareRecord() {
  try {
    const doc = snapshot.doc;
    const now = new Date();
    const today: DaySummary = { start: doc.day.periodStart, goalMinutes: doc.settings.goalMinutes, usedMinutes: doc.day.usedMinutes, topUps: doc.day.topUps, state: doc.day.uncounted ? 'partly' : 'counted' };
    screenTime.shareWithWidget(widgetRecord(recordView(doc.record ?? freshRecord(now), doc.history, today, now, doc.settings.rechargeMinute), proOn));
  } catch {
    // The widget keeps what it last had.
  }
}

// On a real phone, a change to the settings is handed to Screen Time a moment
// later, so a run of taps on a stepper is one change, not ten. Registering the
// day holds the app up for a moment, and the phone then reports the day again,
// so the goal's stepper waits until the taps have stopped for a while (build
// 127: the screen caught on every tap). Leaving the app hands it over at once.
const PLAN_WAIT_MS = 600;
export const STEP_SETTLE_MS = 2500;
let replan: ReturnType<typeof setTimeout> | null = null;
/** A goal step went up since the day was last registered (see `planNow`). */
let uncoverOnPlan = false;
function planSoon(wait = PLAN_WAIT_MS) {
  if (!screenTime.isOn()) return;
  if (replan) clearTimeout(replan);
  replan = setTimeout(planNow, wait);
}

/** Registers the day with the settings as they are now. */
function planNow() {
  if (replan) clearTimeout(replan);
  replan = null;
  batteryTakesOver(new Date());
  const { settings, day } = snapshot.doc;
  try {
    // Back up after a lowering the phone was told of: the screen the lower goal put up no longer applies.
    // (The phone puts it back once it has reported the day for the goal it now has, if it does.)
    const registered = screenTime.registeredGoal();
    if (uncoverOnPlan && registered > 0 && settings.goalMinutes > registered) screenTime.coverAgain(batteryLocked(snapshot.doc, new Date()), settings, day.topUps);
  } catch {
    // The registration below takes them off too.
  }
  uncoverOnPlan = false;
  void screenTime.applyPlan(settings, day.topUps);
}

/** A change still waiting to reach the phone goes now: the app is being left. */
function planWaiting() {
  if (replan) planNow();
}

/**
 * An emergency pass let today's goal go up (goal.ts), and the day is about to
 * be registered with it. If the battery that gives holds out longer than the
 * pass's open time has left, even with the apps in use all along, the open time
 * ends now and the battery takes over: otherwise the phone would cover the
 * apps at the pass's end with charge still in the battery. If it doesn't, the
 * open time runs on and the phone covers the apps at its end as usual (and if
 * some charge is still left then, `uncoverWithCharge` takes the covers off).
 */
function batteryTakesOver(now: Date) {
  try {
    const doc = snapshot.doc;
    const { day, settings } = doc;
    if (!screenTime.isOn() || day.unlockedUntil === null || !isUnlocked(day, now)) return;
    if (settings.goalMinutes <= screenTime.registeredGoal()) return;
    const openLeft = (new Date(day.unlockedUntil).getTime() - now.getTime()) / 60000;
    if (settings.goalMinutes - day.usedMinutes < openLeft) return;
    screenTime.endExtraTime();
    set({ ...doc, day: { ...day, unlockedUntil: null } });
  } catch {
    // The open time runs on; `uncoverWithCharge` puts its end right.
  }
}

/**
 * Earned time or a pass has ended and the phone covered the apps by the
 * clock, but the battery has charge: a change made while the settings were
 * open took minutes off (new essentials stop counting what they used today)
 * or gave it more (a higher goal). Once the count has settled, the covers come off,
 * once for each stretch of open time; the battery's own checkpoints cover
 * the apps again when it is empty.
 */
let uncoveredAfter: string | null = null;
function uncoverWithCharge(doc: Doc, now: Date) {
  const { day, settings } = doc;
  if (!screenTime.isOn() || day.unlockedUntil === null) return;
  if (isUnlocked(day, now) || uncoveredAfter === day.unlockedUntil) return;
  if (cellsLeft(day.usedMinutes, settings.goalMinutes) === 0 || screenTime.busyRegistering() || screenTime.locksHeldUntil() > 0) return;
  uncoveredAfter = day.unlockedUntil;
  screenTime.coverAgain(false, settings, day.topUps);
}

/**
 * The essentials were chosen for the first time, on an empty battery. Their
 * minutes stop counting at once, so the battery may have charge again, while
 * the covers went up for a count that took them in. Once the phone has
 * re-reported the day without them, the covers come off if it has; the
 * battery's own checkpoints cover the apps again when it is empty. (A later
 * change of essentials waits for the recharge, or comes with a pass, which
 * `uncoverWithCharge` sees to.)
 */
const FIRST_ESSENTIALS_LOOKS_MS = [6_000, 12_000, 25_000, 45_000, 70_000];
function uncoverAfterFirstEssentials() {
  let done = false;
  for (const wait of FIRST_ESSENTIALS_LOOKS_MS) {
    setTimeout(() => {
      if (done || snapshot.state !== 'ready') return;
      try {
        const now = new Date();
        store.tick(now);
        const { day, settings } = snapshot.doc;
        if (!screenTime.isOn() || screenTime.busyRegistering() || !screenTime.countSettled(settings)) return;
        if (cellsLeft(day.usedMinutes, settings.goalMinutes) === 0 || isUnlocked(day, now)) return;
        done = true;
        screenTime.coverAgain(false, settings, day.topUps);
        redrawAndLookAgain();
      } catch {
        // The next look tries again.
      }
    }, wait);
  }
}

/**
 * On a real phone, an empty battery locks the settings until it recharges.
 * Otherwise the way round an empty battery would be to nudge the goal up.
 */
export function settingsLocked(doc: Doc = snapshot.doc): boolean {
  // While locks are held (setup's "start tomorrow") nothing is enforced, so nothing needs guarding.
  // An emergency pass opens the settings for its 15 minutes (record.ts).
  return screenTime.isOn() && cellsLeft(doc.day.usedMinutes, doc.settings.goalMinutes) === 0 && screenTime.locksHeldUntil() === 0 && !passActive(doc.record, new Date());
}

/** The record with this week's pass added, if a Monday has come (record.ts). */
function withPasses(doc: Doc, now: Date): Doc {
  const record = addWeeklyPasses(doc.record ?? freshRecord(now), now);
  return record === doc.record ? doc : { ...doc, record };
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
  // Earned time, or an emergency pass in any mode.
  if (!screenTime.isOn() || day.unlockedUntil === null) return;
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
 * The counting state Today last showed. iOS can take a few seconds, after the
 * app comes back, to say that access was taken away in the Settings app; the
 * second look below redraws Today when the answer has changed. (Build 49 only
 * showed "Not counting" after the app was closed and opened again.)
 */
let shownHealth: screenTime.Health | null = null;
function lookAgain() {
  if (snapshot.state !== 'ready') return;
  store.tick(new Date());
  const now = store.health();
  if (now === shownHealth) return;
  shownHealth = now;
  set(snapshot.doc, false);
}

/**
 * Asks for Screen Time access again, as other Screen Time apps do each time
 * they come to the front. iOS never tells a running app that access was turned
 * off in the Settings app, but asking does: when access is on it shows nothing,
 * and when it was turned off Apple's sheet comes up at once. Allowing it picks
 * the day straight back up; declining leaves the "Not counting" warning. Only
 * while counting is meant to be on: turning it off in the app is respected.
 */
let askingAgain = false;
async function askAgain() {
  if (askingAgain || snapshot.state !== 'ready' || !snapshot.doc.setupDone || snapshot.doc.watching !== true) return;
  askingAgain = true;
  try {
    const asked = Date.now();
    const answer = await screenTime.askPermission();
    // A second or more means the sheet was on screen, so access had been off and
    // the phone dropped the day; register it again (counted from the recharge).
    if (answer === 'approved' && (Date.now() - asked > 1000 || !screenTime.isOn())) {
      await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
    }
    redrawAndLookAgain();
  } catch {
    // Nothing to tell anyone: the next return to the app asks again.
  } finally {
    askingAgain = false;
  }
}

/**
 * Redraws Today now and looks again shortly after. Used after counting is
 * turned back on: the day itself may not change, so nothing else would redraw
 * the warning away (build 54 kept "Not counting" up until the app was reopened).
 */
function redrawAndLookAgain() {
  if (snapshot.state !== 'ready') return;
  store.tick(new Date());
  shownHealth = store.health();
  set(snapshot.doc, false);
  for (const wait of [1500, 5000]) setTimeout(lookAgain, wait);
}

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
  // While counting works, the floor it has reached is something known for the guard.
  if (state === 'fine') {
    screenTime.rightAgain();
    screenTime.noteKnown(doc.settings);
    return doc;
  }
  // During setup, and while Plainlimit itself is registering the day (which can
  // stop and restart the phone's monitoring), a bad reading is Plainlimit's own
  // doing, not a gap in the day. (A Saturday counted from the recharge was
  // marked "not fully counted", most likely by a check during setup's steps.)
  const now = Date.now();
  if (!doc.setupDone || screenTime.busyRegistering(now)) return doc;
  if (state === 'notRegistered' && !reregistered) {
    reregistered = true;
    void screenTime.applyPlan(doc.settings, doc.day.topUps).then(() => store.tick(new Date()));
    return doc;
  }
  // The phone sent a report that cannot be true (a burst of them, 24 November):
  // nothing locked on it, and the part of the day it stood for cannot lock until
  // counting is set up again. Done here by itself, once a battery, while the
  // battery is not empty (an empty one is locked for real and stays so); after
  // that, Today offers Count again.
  if (state === 'miscounted' && recountedFor !== doc.day.periodStart && cellsLeft(doc.day.usedMinutes, doc.settings.goalMinutes) > 0 && screenTime.recountDue(new Date(doc.day.periodStart))) {
    // Kept here as well as on the phone, so a phone that will not save it cannot set off one recount after another.
    recountedFor = doc.day.periodStart;
    screenTime.markRecounted(new Date(doc.day.periodStart));
    // What is known now guards the registration that follows (see `Guard`).
    screenTime.noteKnown(doc.settings);
    void screenTime.countAgain(doc.settings, doc.day.topUps, new Date(doc.day.periodStart)).then(() => redrawAndLookAgain());
    return doc;
  }
  if (doc.day.uncounted) return doc;
  // Only a fault that lasts: a single bad reading between good ones loses nothing.
  const since = screenTime.wrongSince(now);
  if (now - since < WRONG_FOR_MS) return doc;
  screenTime.noteHistoryLoss(`today marked not fully counted (${state} for ${Math.round((now - since) / 60000)} min)`);
  return { ...doc, day: { ...doc.day, uncounted: true } };
}

/** The battery the app last counted again for by itself (see checkHealth). */
let recountedFor: string | null = null;

/** How long counting must look wrong before today is marked not fully counted. */
const WRONG_FOR_MS = 2 * 60 * 1000;

/** The saved copy, brought up to now: closed days, the phone's count, counting's health. */
function loadedDoc(raw: unknown): Doc {
  const savedWatching = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).watching : undefined;
  // A copy saved before the app kept this: counting is on if the phone has the day registered.
  const watching = typeof savedWatching === 'boolean' ? savedWatching : screenTime.isOn();
  let doc = repairDoc(raw, new Date(), closingUsed, counts(watching));
  // Whether reading the saved copy back lost any finished day.
  const savedHistory = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).history : undefined;
  if (Array.isArray(savedHistory)) {
    const kept = new Set(doc.history.map((h) => h.start));
    const lost = savedHistory.map((h) => (h && typeof h === 'object' ? (h as Record<string, unknown>).start : null)).filter((s): s is string => typeof s === 'string' && !kept.has(new Date(s).toISOString()));
    if (lost.length > 0) noteLoss(lost, 'loading');
  } else if (raw) {
    screenTime.noteHistoryLoss('loaded a saved copy with no history in it');
  }
  if (doc.watching === null) doc = { ...doc, watching };
  return checkHealth({ ...doc, day: withRealUse(doc, doc.day) });
}

/** Whether the battery's own covers are up now: empty, no earned time, not held for setup. */
function batteryLocked(doc: Doc, now: Date): boolean {
  return screenTime.isOn() && cellsLeft(doc.day.usedMinutes, doc.settings.goalMinutes) === 0 && !isUnlocked(doc.day, now) && screenTime.locksHeldUntil() === 0;
}

/**
 * A higher goal (goal.ts) or a new recharge time (recharge.ts) starts at the
 * recharge, but the phone keeps the old ones until the app registers the day
 * again: it cannot do that by itself. So on the first look after the
 * recharge (and at start, for one that passed while the app was closed) the
 * day is registered with the new ones, and any cover put up since under the
 * old ones is taken off (put back at once if the battery is empty under the
 * new ones too). Until then the phone holds to the old goal, the stricter
 * one, and the old recharge time. Once per change, so a registration that
 * keeps failing is not tried on every tick.
 */
let caughtUpTo: string | null = null;
function catchUpPhone(doc: Doc, now: Date) {
  try {
    if (!screenTime.isOn()) return;
    const { goalMinutes, rechargeMinute } = doc.settings;
    const goal = screenTime.registeredGoal();
    const recharge = screenTime.registeredRecharge();
    const goalMoved = goal > 0 && goal !== goalMinutes;
    // Unknown for a day registered before this was kept: then nothing is assumed.
    const rechargeMoved = recharge !== null && recharge !== rechargeMinute;
    const change = `${goalMinutes}/${rechargeMinute}`;
    if ((!goalMoved && !rechargeMoved) || caughtUpTo === change) return;
    caughtUpTo = change;
    if (rechargeMoved || goalMinutes > goal) screenTime.coverAgain(batteryLocked(doc, now), doc.settings, doc.day.topUps);
    planSoon();
  } catch {
    // Tried again on the next start.
  }
}

/**
 * Whether a change to the essentials starts at once whatever it is, as a
 * higher goal does: during setup, on its own day, and while an emergency pass
 * runs (essentials.ts). Otherwise a new essential waits for the recharge.
 */
function essentialsFree(doc: Doc, now: Date): boolean {
  return goalFree(doc) || passActive(doc.record, now);
}

/**
 * The first look at a battery: essentials waiting for it start now, and the
 * list in force is noted as the one the battery started with (essentials.ts).
 * Like a waiting goal, the phone cannot do this by itself, so until the app
 * is opened after the recharge it holds to the old list, the stricter one;
 * what a new essential used in between stops counting once it has started.
 * Once a battery (`essentialsNoted`).
 */
function startEssentialsDay() {
  try {
    const doc = snapshot.doc;
    if (!loaded || doc.day.essentialsNoted || !screenTime.SCREEN_TIME_AVAILABLE) return;
    const started = screenTime.startWaitingPicks(true);
    set({ ...doc, day: { ...doc.day, essentialsNoted: true } });
    if (started) store.picksChanged();
  } catch {
    // Tried again on the next look.
  }
}

/**
 * Setup is through: from now until the next recharge the goal still changes
 * freely, to get a feel for it (goal.ts).
 */
function throughSetup(doc: Doc): Doc {
  if (doc.setupDone) return doc;
  return { ...doc, setupDone: true, day: { ...doc.day, firstDay: true } };
}

/**
 * Puts the Ask first list on the phone as the settings say (askFirst.ts),
 * while counting is on. Taking its cover off also uncovers an app on both
 * lists, so the battery's covers go back up if it is empty.
 */
function syncAskFirst() {
  // Runs at start and on every return to the app: it must never throw.
  try {
    const doc = snapshot.doc;
    if (snapshot.state !== 'ready' || doc.watching !== true || screenTime.permission() !== 'approved') return;
    void applyAskFirst(doc.settings.askFirst, { empty: batteryLocked(doc, new Date()), recharge: clockLabel(doc.settings.rechargeMinute) })
      .then(() => {
        if (batteryLocked(snapshot.doc, new Date())) screenTime.coverEmptyNow(snapshot.doc.settings, snapshot.doc.day.topUps);
      })
      .catch(() => {});
  } catch {
    // Tried again on the next return to the app.
  }
}

/**
 * Whether this phone has Pro (src/pro/pro.ts tells the store through `setPro`).
 * Losing it (a refund) changes no saved setting: the recharge time stays as
 * chosen, the sums fall back to normal by themselves (see `sumLevelFor`), and
 * Second thought stops running with its choices kept (see `askAllowed`).
 */
let proOn = false;
/** Whether Pro's saved answer has been read yet; until then nothing is taken away. */
let proKnown = false;

/**
 * Second thought is Pro (the owner, 2026-11-23). Until Pro's answer is in,
 * it is left as it was: a start of the app must not take its covers off for
 * the moment before the answer is read (that would also forget a stretch
 * that a sum has just opened).
 */
function askAllowed(): boolean {
  return proOn || !proKnown;
}

function withSettings(change: (s: Settings) => Settings, wait = PLAN_WAIT_MS) {
  if (settingsLocked()) return;
  // A new recharge time can move the start of the current battery.
  set(advanced(snapshot.doc, new Date(), change(snapshot.doc.settings)));
  planSoon(wait);
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
    // Which draft of setup this phone is trying (test builds; setupKind.ts).
    await setupKind.start();
    let doc: Doc;
    try {
      doc = withPasses(loadedDoc(raw), new Date());
    } catch {
      // Nothing may keep the app on its splash screen: start from the saved
      // copy alone, without asking the phone anything, and catch up on the next look.
      try {
        doc = repairDoc(raw, new Date(), () => null, true);
      } catch {
        doc = freshDoc(new Date());
      }
      screenTime.noteHistoryLoss('started without the phone after an error while loading');
    }
    loaded = true;
    set(doc);
    screenTime.refreshScreens(doc.settings, doc.day.topUps);
    catchUpPhone(doc, new Date());
    startEssentialsDay();
    screenTime.onCheckpoint(() => store.tick(new Date()));
    // A day registered by a version that counted a list of apps moves over to counting everything (tally.ts).
    if (screenTime.moveToEverything(doc.settings.goalMinutes)) planSoon(0);
    void askAgain();
    syncAskFirst();
    // Coming back to the app is a free moment to bring the battery and the widget up to date.
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        planWaiting();
        return;
      }
      store.tick(new Date());
      void askAgain();
      for (const wait of [1500, 5000, 10000, 20000]) setTimeout(lookAgain, wait);
      if (snapshot.state === 'ready') screenTime.refreshScreens(snapshot.doc.settings, snapshot.doc.day.topUps);
      syncAskFirst();
      if (screenTime.isOn()) screenTime.reloadWidget();
    });
  },
  /** Called as time passes: starts a fresh battery once the recharge time has gone by. */
  tick(now: Date) {
    if (snapshot.state !== 'ready') return;
    // Runs from timers and the phone's reports: an error here must never become
    // an uncaught one (fatal in a store build). The next tick tries again.
    try {
      coverWhenEarnedTimeIsUp(snapshot.doc, now);
      const moved = advanced(snapshot.doc, now);
      const doc = withPasses(checkHealth({ ...moved, day: withRealUse(moved, moved.day) }), now);
      uncoverWithCharge(doc, now);
      if (doc.day === snapshot.doc.day && doc.history === snapshot.doc.history && doc.record === snapshot.doc.record) {
        startEssentialsDay();
        return;
      }
      const recharged = doc.day.periodStart !== snapshot.doc.day.periodStart;
      set(doc);
      if (recharged) catchUpPhone(doc, now);
      startEssentialsDay();
      // The app has just learned something the widget may not have drawn yet.
      if (screenTime.isOn()) screenTime.reloadWidget();
    } catch {
      // Left as it was until the next tick.
    }
  },
  /**
   * Asks for Screen Time access and, once given, registers the day with the
   * phone. From then on the battery follows real screen time, with or without
   * essentials: with none chosen, everything counts. (Up to build 164 nothing
   * could be counted until Apple's lists had been through, and App Review, on
   * an iPad, skipped them and found a button that did nothing, 2026-11-26.)
   * "denied": `screenTime.refusal()` says why.
   */
  async turnOnScreenTime(): Promise<'on' | 'denied' | 'failed'> {
    const answer = await screenTime.askPermission();
    if (answer !== 'approved') return 'denied';
    // Counting always takes in the whole day since the recharge, so turning it
    // on at any time picks up what was already used, and off-and-on is no refill.
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
    set({ ...snapshot.doc, watching: ok, day: withRealUse(snapshot.doc, snapshot.doc.day) });
    redrawAndLookAgain();
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
    // Always ask: iOS may still be saying "approved" after access was turned off
    // in the Settings app. When access is really on, this shows nothing.
    if ((await screenTime.askPermission()) !== 'approved') return 'denied';
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps);
    redrawAndLookAgain();
    return ok ? 'on' : 'failed';
  },
  /** The phone miscounted: forget its impossible reports and count the day again. */
  async countAgain(): Promise<boolean> {
    const doc = snapshot.doc;
    const ok = await screenTime.countAgain(doc.settings, doc.day.topUps, new Date(doc.day.periodStart));
    redrawAndLookAgain();
    return ok;
  },
  /** The first-run setup is finished. */
  finishSetup() {
    set(throughSetup(snapshot.doc));
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
    set({ ...throughSetup(doc), watching: true });
  },
  /**
   * Setup, when today was already past the goal: counting is on, but nothing
   * locks until the next recharge. Today is marked as not fully counted.
   */
  startTomorrow() {
    const doc = snapshot.doc;
    const at = new Date(doc.day.periodStart);
    screenTime.holdLocks(nextRecharge(at, doc.settings.rechargeMinute).getTime(), doc.settings, doc.day.topUps);
    screenTime.noteHistoryLoss('today marked not fully counted (started tomorrow in setup)');
    const through = throughSetup(doc);
    set({ ...through, watching: true, day: { ...through.day, uncounted: true } });
  },
  /** The starting figure looked wrong: count from this moment instead, from zero. */
  async countFromNow(): Promise<boolean> {
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps, true);
    const through = throughSetup(snapshot.doc);
    set({ ...through, watching: ok, day: { ...through.day, usedMinutes: 0 } });
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
    // As at a recharge, a goal waiting for it starts.
    const next = goalAtRecharge(snapshot.doc.settings);
    const day = { ...freshDay(now, next.settings.rechargeMinute), ...next.day };
    // The fresh day first: while the phone is being told, nothing may act on the old one.
    set({ ...snapshot.doc, settings: next.settings, day });
    // ...and essentials waiting for it start, so the count that starts now is for the new list.
    startEssentialsDay();
    await screenTime.applyPlan(snapshot.doc.settings, 0, true);
    set({ ...snapshot.doc, day: withRealUse(snapshot.doc, snapshot.doc.day) });
  },
  /**
   * Developer, test builds: the first setup again, as on a phone where the
   * essentials were never chosen, for trying the drafts of setup
   * (setupKind.ts). Counting stays on, so today is still counted: with the
   * essentials forgotten, everything they used today counts until they are
   * chosen again.
   */
  setupAgain() {
    screenTime.forgetEssentials();
    store.picksChanged();
    set({ ...snapshot.doc, setupDone: false });
  },
  turnOffScreenTime() {
    screenTime.turnOff();
    // The rest of today is not counted, and the week view says so.
    screenTime.noteHistoryLoss('today marked not fully counted (counting turned off)');
    set({ ...snapshot.doc, watching: false, day: { ...snapshot.doc.day, uncounted: true } });
  },
  /** The person changed their picks in Apple's list: tell the phone, and redraw. */
  picksChanged() {
    // Before registering again: reports from before this moment were for the old list.
    if (screenTime.picksAfter(snapshot.doc.settings.goalMinutes)) {
      // Look again while the phone re-reports the day, so Today moves to the new figure once it has.
      for (const wait of [3000, 6000, 10000, 16000]) setTimeout(() => store.tick(new Date()), wait);
      // While the battery is empty the covers are up, built from the old list:
      // put them up again from the new one.
      const { day, settings } = snapshot.doc;
      if (screenTime.isOn() && cellsLeft(day.usedMinutes, settings.goalMinutes) === 0) {
        screenTime.coverAgain(!isUnlocked(day, new Date()) && screenTime.locksHeldUntil() === 0, settings, day.topUps);
      }
    }
    planSoon();
    set({ ...snapshot.doc }, false);
  },
  /**
   * Apple's picker closed on the essentials. An app taken out, or one this
   * battery started with put back: today, at once. A new essential: from the
   * next recharge, or today on a free day (essentials.ts). The first choice
   * of all is today's at once: until then everything counted, since setup
   * no longer asks (setupKind.ts). Returns how many were ticked if that was
   * too many to keep (0 when kept).
   */
  essentialsClosed(): number {
    const now = new Date();
    store.tick(now);
    startEssentialsDay();
    // The first choice of all starts at once, whatever the battery (screenTime.ts, essentialsAfter).
    const first = !screenTime.essentialsChosen();
    const wasEmpty = cellsLeft(snapshot.doc.day.usedMinutes, snapshot.doc.settings.goalMinutes) === 0;
    const refused = screenTime.essentialsAfter(essentialsFree(snapshot.doc, now));
    store.picksChanged();
    if (first && wasEmpty && refused === 0 && screenTime.essentialsChosen()) uncoverAfterFirstEssentials();
    // A warning about the older list is settled by this; Today has to hear of it (build 90 kept "Not locking" up).
    redrawAndLookAgain();
    return refused;
  },
  /**
   * One step on the goal's stepper. Lower, or back up to the goal the day
   * started with: today, at once. Higher than that: from the next recharge,
   * or today while an emergency pass runs (goal.ts). The phone is told only
   * when today's goal changes.
   */
  stepGoal(direction: 1 | -1) {
    if (settingsLocked()) return;
    const now = new Date();
    const before = snapshot.doc.settings.goalMinutes;
    set(stepChosenGoal(advanced(snapshot.doc, now), direction, passActive(snapshot.doc.record, now)));
    const after = snapshot.doc.settings.goalMinutes;
    if (after === before) return;
    // A tap only redraws; the phone hears of the goal once the taps stop (planSoon).
    if (after > before) uncoverOnPlan = true;
    planSoon(STEP_SETTLE_MS);
  },
  /** Whether the goal's stepper can go that way: not past its limits, nor below what today has used (goal.ts). */
  canStepGoal(direction: 1 | -1): boolean {
    return !settingsLocked() && canStepGoal(snapshot.doc, direction, passActive(snapshot.doc.record, new Date()));
  },
  /**
   * Changing the recharge time is Pro. A time chosen before Pro existed (1.0)
   * is kept as it is. A new time waits for this battery to end, except on
   * setup's own day (recharge.ts); only then are the battery and the phone
   * changed now.
   */
  stepRecharge(direction: 1 | -1) {
    if (!proOn || settingsLocked()) return;
    const doc = advanced(snapshot.doc, new Date());
    const change = stepChosenRecharge(doc, direction);
    if (change.now) withSettings(() => change.settings, STEP_SETTLE_MS);
    else set({ ...doc, settings: change.settings });
  },
  setEmptyLevel(emptyLevel: EmptyLevel) {
    withSettings((s) => ({ ...s, emptyLevel }));
  },
  /** How hard the sums are. Normal is free; easy and hard are Pro. */
  setSumLevel(sumLevel: SumLevel) {
    if (sumLevel !== 'normal' && !proOn) return;
    withSettings((s) => ({ ...s, sumLevel }));
  },
  /**
   * The lock screen message (free for now; Pro once it has been tested, the
   * owner, 2026-11-18). Not closed while the battery is empty:
   * words cannot open anything. The covering screens are written again at once.
   */
  setLockMessage(text: string) {
    const lockMessage = cleanLockMessage(text);
    // Words of one's own are Pro; the ready-made messages and no message are free.
    // A message typed before this was Pro stays until it is changed.
    if (lockMessage && !isLockMessageIdea(lockMessage) && !proOn) return;
    const { lockMessage: _old, ...rest } = snapshot.doc.settings;
    const settings: Settings = lockMessage ? { ...rest, lockMessage } : rest;
    set({ ...snapshot.doc, settings });
    screenTime.refreshScreens(settings, snapshot.doc.day.topUps);
  },
  /** Pro was bought, restored, refunded or read at start (src/pro/pro.ts). `known` is false until the saved answer is read. */
  setPro(on: boolean, known: boolean) {
    const allowedBefore = askAllowed();
    proOn = on;
    proKnown = known;
    allowAskFirst(askAllowed());
    if (loaded) shareRecord();
    // Bought, restored or refunded: Second thought's covers go on or come off now.
    if (askAllowed() !== allowedBefore) syncAskFirst();
  },
  hasPro(): boolean {
    return proOn;
  },
  /**
   * Ask first's settings (Pro). Not closed while the battery is empty: nothing
   * here can open an app that counts (see `syncAskFirst`).
   */
  setAskFirst(change: Partial<AskFirst>) {
    if (!askAllowed()) return;
    const settings = snapshot.doc.settings;
    set({ ...snapshot.doc, settings: { ...settings, askFirst: { ...(settings.askFirst ?? DEFAULT_ASK_FIRST), ...change } } });
    syncAskFirst();
  },
  /**
   * Apple's list of Ask first picks was closed with `picked` apps in it.
   * Picking apps turns the list on and an empty list turns it off, so the
   * switch never says off beside apps just picked (the owner, 2026-11-21).
   */
  askPicksChanged(picked: number) {
    if (!askAllowed()) return;
    const settings = snapshot.doc.settings;
    set({ ...snapshot.doc, settings: { ...settings, askFirst: { ...(settings.askFirst ?? DEFAULT_ASK_FIRST), on: onAfterPicking(picked) } } });
    syncAskFirst();
  },
  /**
   * The sum on the Ask first screen was solved: open the list for a while.
   * While the battery's covers are up, apps that also count stay covered.
   */
  async openAskFirst(): Promise<AskOpen | null> {
    if (!askAllowed()) return null;
    const { settings } = snapshot.doc;
    const now = new Date();
    const open = await openAsk(settings.askFirst ?? DEFAULT_ASK_FIRST, nextRecharge(now, settings.rechargeMinute).getTime(), now);
    if (open && batteryLocked(snapshot.doc, now)) screenTime.coverEmptyNow(settings, snapshot.doc.day.topUps);
    return open;
  },
  /** Whether an emergency pass can be used now (record.ts). */
  passCheck(): 'ok' | 'none' | 'usedToday' | 'running' {
    const doc = snapshot.doc;
    return passCheck(doc.record ?? freshRecord(new Date()), new Date(doc.day.periodStart), new Date());
  },
  /**
   * Uses an emergency pass: everything opens for 15 minutes, settings
   * included, in any mode. The apps open the way earned time opens them, and
   * the phone covers them again by itself when it ends.
   */
  usePass(): boolean {
    const now = new Date();
    const doc = snapshot.doc;
    const record = doc.record ?? freshRecord(now);
    if (passCheck(record, new Date(doc.day.periodStart), now) !== 'ok') return false;
    const recharge = nextRecharge(now, doc.settings.rechargeMinute).getTime();
    const used = spendPass(record, now, recharge);
    const until = used.passUntil as string;
    const unlockedUntil = doc.day.unlockedUntil && new Date(doc.day.unlockedUntil) > new Date(until) ? doc.day.unlockedUntil : until;
    const day = { ...doc.day, unlockedUntil };
    set({ ...doc, record: used, day });
    if (screenTime.isOn()) void screenTime.grantExtraTime(new Date(unlockedUntil), doc.settings, day.topUps, now);
    if (doc.settings.askFirst?.on && askAllowed()) void openAsk({ ...doc.settings.askFirst, openMinutes: 15, whileInUse: false }, recharge, now);
    // A pass skips the wait: essentials waiting for the recharge start now (essentials.ts).
    try {
      if (screenTime.startWaitingPicks(false)) store.picksChanged();
    } catch {
      // They start at the recharge, as they would have.
    }
    return true;
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
    const next = goalAtRecharge(snapshot.doc.settings);
    set({ ...snapshot.doc, settings: next.settings, day: { ...freshDay(new Date(), next.settings.rechargeMinute), ...next.day } });
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

/**
 * One plain value from the store, redrawing only when it changes. For the
 * layouts and the tab bar: drawn again on every change, they redrew every
 * screen's header and tab on each tap of a stepper (build 127).
 */
export function useStoreValue<T extends string | number | boolean | null | undefined>(pick: (snapshot: Snapshot) => T): T {
  const read = () => pick(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
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
