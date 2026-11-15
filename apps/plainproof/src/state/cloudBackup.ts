import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { setIcloudBackup } from '@/domain/actions';
import { mapDocs, totalItems } from '@/domain/library';
import { backupState } from '@/domain/selectors';
import { dropOutboxFile } from '@/platform/exporter';
import { readText, writeText } from '@/platform/files';
import { native, type FolderInfo } from '@/platform/native';

import { backUpToFile, markBackedUp } from './operations';
import { store } from './store';

// The backup that keeps itself: once the person picks a folder in iCloud Drive,
// a fresh backup is saved there by itself a little while after they change
// something, and when the app goes to the background. Off until they turn it on.
//
// iOS lets an app keep writing to a folder the person picked by keeping a
// bookmark to it. The bookmark belongs to this iPhone, so it is kept in its own
// file here and never in the inventory (or a backup of it).

const STATE_FILE = 'icloud-backup.json';
export const BACKUP_NAME = 'Plainproof backup.zip';
export const PREVIOUS_NAME = 'Plainproof backup (previous).zip';
/** How long after the last change the backup waits, so a burst of edits makes one backup. */
const SETTLE_MS = 90_000;

export type CloudProblem = 'folder-gone' | 'failed' | null;

interface Saved {
  bookmark: string | null;
  folder: FolderInfo | null;
  lastSavedAt: number | null;
  problem: CloudProblem;
}

export interface CloudBackupState extends Saved {
  /** False in Expo Go and the web preview, where the app's native module is missing. */
  available: boolean;
  on: boolean;
  saving: boolean;
}

let saved: Saved = { bookmark: null, folder: null, lastSavedAt: null, problem: null };
let saving = false;
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function isOn(): boolean {
  return store.snapshot().state === 'ready' && store.get().settings.icloudBackup;
}

async function persist(next: Partial<Saved>) {
  saved = { ...saved, ...next };
  emit();
  await writeText(STATE_FILE, JSON.stringify(saved)).catch(() => {});
}

async function load() {
  try {
    const text = await readText(STATE_FILE);
    if (text) {
      const raw = JSON.parse(text) as Partial<Saved>;
      saved = {
        bookmark: typeof raw.bookmark === 'string' ? raw.bookmark : null,
        folder: raw.folder && typeof raw.folder.name === 'string' ? { name: raw.folder.name, inCloud: raw.folder.inCloud === true } : null,
        lastSavedAt: typeof raw.lastSavedAt === 'number' ? raw.lastSavedAt : null,
        problem: raw.problem === 'folder-gone' || raw.problem === 'failed' ? raw.problem : null,
      };
    }
  } catch {
    // A bad state file only means the folder is chosen again.
  }
  loaded = true;
  emit();
}

/** Whether the inventory has changed since its last backup, of any kind. */
function due(): boolean {
  if (!native || !loaded || !isOn() || !saved.bookmark || saving) return false;
  const lib = store.library();
  // An empty inventory is never saved over a backup that has things in it.
  if (totalItems(lib) === 0) return false;
  return lib.places.some((p) => {
    const s = backupState(p.doc);
    return s === 'never' || s === 'behind';
  });
}

function later() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!due()) return;
  timer = setTimeout(() => {
    timer = null;
    void cloudBackup.runNow();
  }, SETTLE_MS);
}

export const cloudBackup = {
  start(): void {
    if (loaded) return;
    void load().then(later);
    store.subscribe(later);
    AppState.addEventListener('change', (state) => {
      // Going to the background is the moment a backup matters most: the phone may not come back.
      if (state === 'background' && due()) void cloudBackup.runNow();
      else if (state === 'active') later();
    });
  },

  /** Saves a backup to the folder now. Returns false if it could not. */
  async runNow(): Promise<boolean> {
    if (!native || !saved.bookmark || saving) return false;
    saving = true;
    emit();
    let uri: string | null = null;
    try {
      const made = await backUpToFile();
      uri = made.uri;
      const result = await native.saveToFolder(saved.bookmark, made.uri, BACKUP_NAME, PREVIOUS_NAME);
      markBackedUp(made.at);
      await persist({ lastSavedAt: made.at, problem: null, bookmark: result.bookmark ?? saved.bookmark });
      return true;
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      await persist({ problem: code === 'ERR_FOLDER_GONE' ? 'folder-gone' : 'failed' });
      return false;
    } finally {
      if (uri) dropOutboxFile(uri);
      saving = false;
      emit();
    }
  },

  /** Asks for the folder and turns the backup on. 'cancelled' if the person backed out of choosing. */
  async turnOn(): Promise<'on' | 'cancelled' | 'unavailable'> {
    if (!native) return 'unavailable';
    const picked = await native.pickFolder();
    if (!picked) return 'cancelled';
    await persist({ bookmark: picked.bookmark, folder: { name: picked.name, inCloud: picked.inCloud }, problem: null });
    store.updateLibrary((lib) => mapDocs(lib, (d) => (d.settings.icloudBackup ? d : setIcloudBackup(d, true))));
    void cloudBackup.runNow();
    return 'on';
  },

  /** Turns it off. The backups already in the folder stay there. */
  async turnOff(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    store.updateLibrary((lib) => mapDocs(lib, (d) => (d.settings.icloudBackup ? setIcloudBackup(d, false) : d)));
    await persist({ bookmark: null, folder: null, problem: null });
  },

  snapshot(): CloudBackupState {
    return { ...saved, available: native !== null, on: isOn(), saving };
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useCloudBackup(): CloudBackupState {
  const [state, setState] = useState(cloudBackup.snapshot);
  useEffect(() => {
    const update = () => setState(cloudBackup.snapshot());
    const a = cloudBackup.subscribe(update);
    const b = store.subscribe(update);
    update();
    return () => {
      a();
      b();
    };
  }, []);
  return state;
}
