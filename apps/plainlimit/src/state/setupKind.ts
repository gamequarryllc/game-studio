import { useSyncExternalStore } from 'react';

import { Platform } from 'react-native';

import { readNote, writeNote } from '@/platform/storage';

// Two drafts of the first setup, for the owner to try side by side in a test
// build (2026-11-27). Both count everything from the start (domain/tally.ts):
// - 'nothing': nothing to pick. Setup has no essentials step at all; Today
//   offers "Keep your essentials free" afterwards, until they are chosen.
// - 'oneList': setup keeps its essentials step, and Apple's list opens once,
//   for the essentials alone. Skipping it still counts everything.
// The draft in use is kept on the phone, apart from the app's saved copy, and
// is switched in Settings under Developer (and on setup's first screen), which
// a store build does not have. The preview's address can name one: "?setup=1".

export type SetupKind = 'nothing' | 'oneList';

const KEY = 'plainlimit.setupKind.v1';

/** What a store build does, and a test build until told otherwise. */
export const DEFAULT_SETUP: SetupKind = 'nothing';

function fromAddress(): SetupKind | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('setup');
    return asked === '1' ? 'oneList' : asked === '3' ? 'nothing' : null;
  } catch {
    return null;
  }
}

let kind: SetupKind = fromAddress() ?? DEFAULT_SETUP;
let started = false;
const listeners = new Set<() => void>();

function put(next: SetupKind) {
  if (next === kind) return;
  kind = next;
  listeners.forEach((l) => l());
}

export const setupKind = {
  /** Reads the saved choice, once. The address's choice, in the preview, wins. */
  async start(): Promise<void> {
    if (started) return;
    started = true;
    if (fromAddress() !== null) return;
    try {
      const saved = await readNote(KEY);
      if (saved === 'nothing' || saved === 'oneList') put(saved);
    } catch {
      // The default stands.
    }
  },
  get(): SetupKind {
    return kind;
  },
  set(next: SetupKind) {
    put(next);
    void writeNote(KEY, next);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The draft of setup in use, redrawn when it is switched. */
export function useSetupKind(): SetupKind {
  return useSyncExternalStore(setupKind.subscribe, setupKind.get, setupKind.get);
}

/** A draft's name as the test build says it. */
export function setupName(of: SetupKind): string {
  return of === 'nothing' ? 'Setup 3: nothing to pick' : 'Setup 1: one list';
}
