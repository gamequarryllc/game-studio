import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { setSettings } from '@/domain/actions';
import { planReminders, type Planned } from '@/domain/reminders';
import { applyPlan, askPermission, permission, type Permission } from '@/platform/notify';

import { store } from './store';

// Keeps the reminders waiting on the phone in step with the log. Whenever the
// log changes, or the app comes back to the front on a new day, the plan is
// worked out again and handed to the phone.

const SETTLE_MS = 400;

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
  return planReminders(snap.doc, now);
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
   * Turns reminders on. Shows the iPhone's question the first time. Returns what the iPhone said:
   * with 'denied', the setting stays on so reminders start the moment they are allowed in the Settings app.
   */
  async turnOn(): Promise<Permission> {
    let now = await permission();
    if (now === 'undetermined') now = await askPermission();
    setAllowed(now);
    store.update((d, t) => (d.settings.reminders ? d : setSettings(d, { reminders: true, reminderHintSeen: true }, t)));
    soon();
    return now;
  },

  turnOff(): void {
    store.update((d, t) => (d.settings.reminders ? setSettings(d, { reminders: false }, t) : d));
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
