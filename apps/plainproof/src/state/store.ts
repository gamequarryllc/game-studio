import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { emptyDoc, parseDocText, serializeDoc } from '@/domain/doc';
import { currencyForLocale } from '@/domain/money';
import type { Doc } from '@/domain/types';
import { readPreviousText, readText, writeText } from '@/platform/files';

// The one place the inventory lives while the app is open. Screens read it
// with useDoc() and change it with update(); every change is written to the
// phone shortly after.

const FILE = 'inventory.json';
const SAVE_DELAY_MS = 250;

export type LoadState = 'loading' | 'ready';

interface Snapshot {
  state: LoadState;
  doc: Doc;
  /** True when the saved file was unreadable and an older copy (or nothing) was used. */
  recovered: boolean;
  /** Set when a save failed; cleared by the next good one. */
  saveFailed: boolean;
}

let snapshot: Snapshot = { state: 'loading', doc: emptyDoc(0), recovered: false, saveFailed: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let saving: Promise<void> = Promise.resolve();
let started: Promise<void> | null = null;

function emit(next: Snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function deviceLocale(): string | undefined {
  try {
    return Intl.NumberFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

async function load(): Promise<void> {
  const now = Date.now();
  let doc: Doc | null = null;
  let recovered = false;
  const main = await readText(FILE).catch(() => null);
  if (main !== null) {
    try {
      doc = parseDocText(main, now);
    } catch {
      recovered = true;
    }
  }
  if (!doc && recovered) {
    const previous = await readPreviousText(FILE).catch(() => null);
    if (previous !== null) {
      try {
        doc = parseDocText(previous, now);
      } catch {
        doc = null;
      }
    }
  }
  emit({ state: 'ready', doc: doc ?? emptyDoc(now, currencyForLocale(deviceLocale())), recovered, saveFailed: false });
}

function write(): Promise<void> {
  if (!dirty) return saving;
  dirty = false;
  const text = serializeDoc(snapshot.doc);
  saving = saving
    .then(() => writeText(FILE, text))
    .then(
      () => {
        if (snapshot.saveFailed) emit({ ...snapshot, saveFailed: false });
      },
      () => {
        dirty = true;
        if (!snapshot.saveFailed) emit({ ...snapshot, saveFailed: true });
      },
    );
  return saving;
}

function schedule() {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void write();
  }, SAVE_DELAY_MS);
}

export const store = {
  start(): Promise<void> {
    if (!started) {
      started = load();
      AppState.addEventListener('change', (state) => {
        if (state !== 'active') void store.flush();
      });
    }
    return started;
  },

  get(): Doc {
    return snapshot.doc;
  },

  /** Applies a change. The function gets the current document and the time. */
  update(change: (doc: Doc, now: number) => Doc): void {
    if (snapshot.state !== 'ready') return;
    const next = change(snapshot.doc, Date.now());
    if (next === snapshot.doc) return;
    emit({ ...snapshot, doc: next });
    schedule();
  },

  /** Swaps in a whole document (a restore, the sample home, erase everything). */
  replace(doc: Doc): Promise<void> {
    emit({ ...snapshot, doc, recovered: false });
    dirty = true;
    return store.flush();
  },

  /** Writes any pending change now. */
  flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return write();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  snapshot(): Snapshot {
    return snapshot;
  },
};

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}

export function useDoc(): Doc {
  return useStore().doc;
}
