import { useSyncExternalStore } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEV_TOOLS } from '@/platform/screenTime';

import { buy, readPrice, restore, startStore, storeAvailable, type BuyResult, type RestoreResult } from './appstore';

// Whether this phone has Pro. Kept under its own key, apart from the app's
// saved copy, so starting over in setup never loses a purchase.

const KEY = 'plainlimit.pro.v1';

/** Developer tools, "Pretend Pro is bought" among them, are only in dev, web and playtest builds (screenTime.ts). */
export { DEV_TOOLS };

export interface ProState {
  ready: boolean;
  /** Pro is on, for whichever reason. */
  isPro: boolean;
  /** Bought through the App Store (as last confirmed). */
  owned: boolean;
  /** Developer setting: behave as if Pro were bought. */
  pretend: boolean;
  /** The store is switched on and can sell or restore. */
  storeOpen: boolean;
  /** The store's own price text, when it could be read. */
  price: string | null;
  busy: boolean;
}

let state: ProState = { ready: false, isPro: false, owned: false, pretend: false, storeOpen: false, price: null, busy: false };
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;

function set(patch: Partial<ProState>) {
  const next = { ...state, ...patch };
  next.isPro = next.owned || (DEV_TOOLS && next.pretend);
  state = next;
  for (const l of listeners) l();
}

function persist() {
  void AsyncStorage.setItem(KEY, JSON.stringify({ owned: state.owned, pretend: state.pretend })).catch(() => {});
}

function setOwned(owned: boolean) {
  if (owned === state.owned) return;
  set({ owned });
  persist();
}

export const pro = {
  start(): Promise<void> {
    if (!started) {
      started = (async () => {
        try {
          const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as { owned?: unknown; pretend?: unknown };
          // The saved answer lets Pro work offline; the store corrects it below when it can be reached.
          set({ owned: saved.owned === true && storeAvailable(), pretend: saved.pretend === true });
        } catch {
          // No saved answer yet.
        }
        set({ ready: true, storeOpen: storeAvailable() });
        try {
          const result = await startStore(setOwned);
          if (storeAvailable()) {
            // null means the iPhone could not say: keep the saved answer.
            if (result.owned !== null) setOwned(result.owned);
            set({ price: result.price });
          }
        } catch {
          // Offline or the store is unreachable: keep the saved answer.
        }
      })();
    }
    return started;
  },

  async buy(): Promise<BuyResult> {
    if (!state.storeOpen || state.busy) return 'failed';
    set({ busy: true });
    const result = await buy();
    if (result === 'purchased') setOwned(true);
    set({ busy: false });
    return result;
  },

  async restore(): Promise<RestoreResult> {
    if (!state.storeOpen || state.busy) return 'failed';
    set({ busy: true });
    const result = await restore();
    if (result === 'restored') setOwned(true);
    set({ busy: false });
    return result;
  },

  /** Reads the price again when it wasn't there at the start (the phone was offline). */
  async refreshPrice(): Promise<void> {
    if (!state.storeOpen || state.price !== null) return;
    const price = await readPrice();
    if (price !== null) set({ price });
  },

  setPretend(pretend: boolean): void {
    if (!DEV_TOOLS) return;
    set({ pretend });
    persist();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  snapshot(): ProState {
    return state;
  },
};

export function usePro(): ProState {
  return useSyncExternalStore(pro.subscribe, pro.snapshot, pro.snapshot);
}
