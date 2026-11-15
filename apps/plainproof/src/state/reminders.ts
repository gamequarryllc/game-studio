import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { setReminders } from '@/domain/actions';
import { mapDocs } from '@/domain/library';
import { planReminders, type Planned } from '@/domain/reminders';
import type { Settings } from '@/domain/types';
import { applyPlan, askPermission, permission, type Permission } from '@/platform/notify';

import { store } from './store';

// Keeps the reminders waiting on the phone in step with the inventory. Whenever
// it changes, or the app comes back to the front, the plan is worked out again
// and handed to the phone.

const SETTLE_MS = 400;

export type ReminderKind = keyof Settings['reminders'];

let allowed: Permission = 'undetermined';
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function setAllowed(next: Permission) {
  if (next === allowed) return;
  allowed = next;
  for (const l of listeners) l();
}

/** The reminders that should be waiting right now: none unless the person asked for them and the iPhone allows them. */
export function currentPlan(now: number = Date.now()): Planned[] {
  const snap = store.snapshot();
  if (snap.state !== 'ready' || allowed !== 'granted') return [];
  return planReminders(snap.library, now);
}

async function sync(): Promise<void> {
  setAllowed(await permission());
  await applyPlan(currentPlan());
}

function soon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sync();
  }, SETTLE_MS);
}

function set(kind: ReminderKind, on: boolean) {
  // Reminder settings are the same in every place.
  store.updateLibrary((lib) => mapDocs(lib, (d) => (d.settings.reminders[kind] === on ? d : setReminders(d, { [kind]: on }))));
}

export const reminders = {
  start(): void {
    if (started) return;
    started = true;
    store.subscribe(soon);
    AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
    });
    soon();
  },

  /**
   * Turns one kind of reminder on. Shows the iPhone's question the first time. Returns what the iPhone said:
   * with 'denied', the setting stays on so reminders start the moment they are allowed in the Settings app.
   */
  async turnOn(kind: ReminderKind): Promise<Permission> {
    let now = await permission();
    if (now === 'undetermined') now = await askPermission();
    setAllowed(now);
    set(kind, true);
    soon();
    return now;
  },

  turnOff(kind: ReminderKind): void {
    set(kind, false);
    soon();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  permission(): Permission {
    return allowed;
  },
};

/** What the iPhone says about notifications for this app, kept fresh while a screen is showing it. */
export function useReminderPermission(): Permission {
  const [value, setValue] = useState<Permission>(allowed);
  useEffect(() => {
    const update = () => setValue(reminders.permission());
    const unsub = reminders.subscribe(update);
    void permission().then((p) => {
      setAllowed(p);
      update();
    });
    return () => {
      unsub();
    };
  }, []);
  return value;
}
