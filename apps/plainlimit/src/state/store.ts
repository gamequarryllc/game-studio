import { useEffect, useState, useSyncExternalStore } from 'react';

import { cellsLeft } from '@/domain/battery';
import { freshDoc, grantTopUp, repairDoc, rollOver, withUse, freshDay } from '@/domain/dayState';
import { topUpPlan } from '@/domain/puzzle';
import { stepGoal, stepRecharge, withAllowed, withoutAllowed } from '@/domain/settings';
import type { CountMode, Doc, EmptyLevel, Settings } from '@/domain/types';
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

function withSettings(change: (s: Settings) => Settings) {
  if (settingsLocked()) return;
  const settings = change(snapshot.doc.settings);
  // A new recharge time can move the start of the current battery.
  const day = rollOver(snapshot.doc.day, new Date(), settings.rechargeMinute);
  set({ ...snapshot.doc, settings, day });
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
    const doc = repairDoc(await readSaved(), new Date());
    set({ ...doc, day: withRealUse(doc, doc.day) }, false);
    screenTime.onCheckpoint(() => store.tick(new Date()));
  },
  /** Called as time passes: starts a fresh battery once the recharge time has gone by. */
  tick(now: Date) {
    if (snapshot.state !== 'ready') return;
    const day = withRealUse(snapshot.doc, rollOver(snapshot.doc.day, now, snapshot.doc.settings.rechargeMinute));
    if (day !== snapshot.doc.day) set({ ...snapshot.doc, day });
  },
  /**
   * Asks for Screen Time access and, once given, registers the day with the
   * phone. From then on the battery follows real screen time.
   */
  async turnOnScreenTime(): Promise<'on' | 'denied' | 'failed'> {
    const answer = await screenTime.askPermission();
    if (answer !== 'approved') return 'denied';
    // Counting starts now: the first day does not include what was used before this moment.
    const ok = await screenTime.applyPlan(snapshot.doc.settings, snapshot.doc.day.topUps, true);
    // Start from what the phone says, not from any pretend use.
    const day = { ...snapshot.doc.day, usedMinutes: 0 };
    set({ ...snapshot.doc, day: withRealUse(snapshot.doc, day) });
    return ok ? 'on' : 'failed';
  },
  /**
   * Developer, on a real phone: a full battery and a count that starts again
   * from now, with every cover taken away. For trying the app without waiting
   * for the recharge time.
   */
  async startDayOver() {
    const now = new Date();
    const day = freshDay(now, snapshot.doc.settings.rechargeMinute);
    await screenTime.applyPlan(snapshot.doc.settings, 0, true);
    set({ ...snapshot.doc, day });
  },
  turnOffScreenTime() {
    screenTime.turnOff();
    set({ ...snapshot.doc });
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
  setCountMode(countMode: CountMode) {
    withSettings((s) => ({ ...s, countMode }));
  },
  setEmptyLevel(emptyLevel: EmptyLevel) {
    withSettings((s) => ({ ...s, emptyLevel }));
  },
  addAllowed(name: string) {
    withSettings((s) => ({ ...s, allowed: withAllowed(s.allowed, name) }));
  },
  removeAllowed(name: string) {
    withSettings((s) => ({ ...s, allowed: withoutAllowed(s.allowed, name) }));
  },
  /** Developer: pretend this many more minutes were used. */
  pretendUse(minutes: number) {
    set({ ...snapshot.doc, day: withUse(snapshot.doc.day, minutes) });
  },
  /** Developer: a full battery, as if the recharge time had just passed. */
  rechargeNow() {
    set({ ...snapshot.doc, day: freshDay(new Date(), snapshot.doc.settings.rechargeMinute) });
  },
  /** The puzzle was solved: start (or extend) the earned time. */
  earnTopUp() {
    const now = new Date();
    const earned = topUpPlan(snapshot.doc.day.topUps);
    const day = grantTopUp(snapshot.doc.day, now, snapshot.doc.settings.rechargeMinute);
    set({ ...snapshot.doc, day });
    void screenTime.grantExtraTime(earned.minutes, snapshot.doc.settings, day.topUps, now);
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
