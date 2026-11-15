import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { emptyDoc } from '@/domain/doc';
import { currentDoc, libraryOf, parseLibraryText, serializeLibrary, setCurrentDoc, stampChanges, totalItems, type Library } from '@/domain/library';
import { currencyForLocale } from '@/domain/money';
import type { Doc } from '@/domain/types';
import { keepDamagedCopy, readPreviousTextResult, readTextResult, writeText } from '@/platform/files';

import { planLoad, type LoadFailure } from './loadPlan';

// Where the inventory lives while the app is open: every place (the library)
// and, for the screens, the document of the place being looked at. Screens
// read that with useDoc() and change it with update(); changes to the places
// themselves go through updateLibrary(). Every change is written to the phone
// shortly after. The file is still called inventory.json; one saved before
// places existed is read as a single home.

const FILE = 'inventory.json';
const SAVE_DELAY_MS = 250;

/** 'failed': a saved inventory is there but could not be opened. Nothing is saved until the person restores a backup or chooses to start over. */
export type LoadState = 'loading' | 'ready' | 'failed';

interface Snapshot {
  state: LoadState;
  /** Every place. */
  library: Library;
  /** The current place's document: what almost every screen works on. */
  doc: Doc;
  /** True when the saved file was unreadable and an older copy (or nothing) was used. */
  recovered: boolean;
  /** Set when a save failed; cleared by the next good one. */
  saveFailed: boolean;
  /** Why the saved inventory could not be opened, when state is 'failed'. */
  failure: LoadFailure | null;
}

const BLANK = libraryOf(emptyDoc(0));
let snapshot: Snapshot = { state: 'loading', library: BLANK, doc: currentDoc(BLANK), recovered: false, saveFailed: false, failure: null };
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
  const main = await readTextResult(FILE).catch((): { kind: 'error' } => ({ kind: 'error' }));
  const previous = await readPreviousTextResult(FILE).catch((): { kind: 'error' } => ({ kind: 'error' }));
  const plan = planLoad(main, previous, (text) => parseLibraryText(text, now));
  if (plan.kind === 'failed') {
    emit({ ...snapshot, state: 'failed', failure: plan.reason });
    return;
  }
  if (plan.kind === 'open' && plan.recovered && main.kind !== 'missing') {
    // The spare copy opened; keep the damaged main file aside before the next save replaces it.
    await keepDamagedCopy(FILE, now);
  }
  const loaded = plan.kind === 'open' ? plan.library : libraryOf(emptyDoc(now, currencyForLocale(deviceLocale())));
  emit({ state: 'ready', library: loaded, doc: currentDoc(loaded), recovered: plan.kind === 'open' && plan.recovered, saveFailed: false, failure: null });
}

function write(): Promise<void> {
  // Never save over a file that could not be opened.
  if (!dirty || snapshot.state !== 'ready') return saving;
  dirty = false;
  const text = serializeLibrary(snapshot.library);
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

  /** Every place. */
  library(): Library {
    return snapshot.library;
  },

  /** Every item in every place: what the free limit counts. */
  itemCount(): number {
    return totalItems(snapshot.library);
  },

  /** Applies a change to the current place. The function gets its document and the time. */
  update(change: (doc: Doc, now: number) => Doc): void {
    if (snapshot.state !== 'ready') return;
    const now = Date.now();
    const next = change(snapshot.doc, now);
    if (next === snapshot.doc) return;
    const library = stampChanges(snapshot.library, setCurrentDoc(snapshot.library, next), now);
    emit({ ...snapshot, library, doc: currentDoc(library) });
    schedule();
  },

  /** Applies a change to the places themselves: adding one, switching, renaming, or a change every place gets. */
  updateLibrary(change: (library: Library, now: number) => Library): void {
    if (snapshot.state !== 'ready') return;
    const now = Date.now();
    const changed = change(snapshot.library, now);
    if (changed === snapshot.library) return;
    const next = stampChanges(snapshot.library, changed, now);
    emit({ ...snapshot, library: next, doc: currentDoc(next) });
    schedule();
  },

  /** Swaps in everything at once (a restore, the sample home, erase everything). */
  async replace(library: Library): Promise<void> {
    if (snapshot.state === 'loading') return;
    // Leaving the "could not be opened" screen (a restore, or starting over): keep the unreadable file aside first.
    if (snapshot.state === 'failed') await keepDamagedCopy(FILE, Date.now());
    emit({ ...snapshot, state: 'ready', failure: null, library, doc: currentDoc(library), recovered: false });
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

export function useLibrary(): Library {
  return useStore().library;
}
