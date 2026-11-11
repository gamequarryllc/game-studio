import { useEffect, useState, useSyncExternalStore } from 'react';

import { freshDoc, grantTopUp, repairDoc, rollOver, withUse, freshDay } from '@/domain/dayState';
import { stepGoal, stepRecharge, withAllowed, withoutAllowed } from '@/domain/settings';
import type { CountMode, Doc, EmptyLevel, Settings } from '@/domain/types';
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

function withSettings(change: (s: Settings) => Settings) {
  const settings = change(snapshot.doc.settings);
  // A new recharge time can move the start of the current battery.
  const day = rollOver(snapshot.doc.day, new Date(), settings.rechargeMinute);
  set({ ...snapshot.doc, settings, day });
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
    set(repairDoc(await readSaved(), new Date()), false);
  },
  /** Called as time passes: starts a fresh battery once the recharge time has gone by. */
  tick(now: Date) {
    if (snapshot.state !== 'ready') return;
    const day = rollOver(snapshot.doc.day, now, snapshot.doc.settings.rechargeMinute);
    if (day !== snapshot.doc.day) set({ ...snapshot.doc, day });
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
    set({ ...snapshot.doc, day: grantTopUp(snapshot.doc.day, new Date(), snapshot.doc.settings.rechargeMinute) });
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
