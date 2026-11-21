import Constants from 'expo-constants';

import { BACKUP_PROBLEM_TEXT, backupName, makeBackup, readBackup, type BackupProblem } from '@/domain/backup';
import { todayYmd } from '@/domain/dates';
import { emptyDoc, photoFiles } from '@/domain/doc';
import { sampleDoc } from '@/domain/sample';
import type { Doc } from '@/domain/types';
import { pickTextFile, shareTextFile } from '@/platform/exporter';
import { deletePhotoFiles, readPhotoBase64, sweepPhotos, writePhotoBase64 } from '@/platform/photos';

import { store } from './store';

// The things the app does that reach outside the document: files in and out.

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0';
}

/** Puts the whole map and its photos in one file and hands it to the share sheet. */
export async function backUp(): Promise<void> {
  await store.flush();
  const doc = store.get();
  const photos: Record<string, string> = {};
  for (const name of photoFiles(doc)) {
    const data = await readPhotoBase64(name);
    if (data !== null) photos[name] = data;
  }
  const now = Date.now();
  await shareTextFile(backupName(todayYmd(now)), 'application/json', 'public.json', makeBackup(doc, photos, now));
}

export type RestoreChoice = { ok: true; doc: Doc; photos: Record<string, string> } | { ok: false; cancelled: true } | { ok: false; cancelled: false; problem: BackupProblem };

/** Lets the person choose a backup and reads it. Nothing is replaced until `applyRestore` is called. */
export async function chooseBackup(): Promise<RestoreChoice> {
  const picked = await pickTextFile();
  if (!picked) return { ok: false, cancelled: true };
  const read = readBackup(picked.text, Date.now());
  if (!read.ok) return { ok: false, cancelled: false, problem: read.problem };
  return { ok: true, doc: read.doc, photos: read.photos };
}

export function restoreProblemText(problem: BackupProblem): { title: string; message: string } {
  return BACKUP_PROBLEM_TEXT[problem];
}

export async function applyRestore(doc: Doc, photos: Record<string, string>): Promise<void> {
  const written = new Set<string>();
  for (const [name, data] of Object.entries(photos)) {
    if (await writePhotoBase64(name, data)) written.add(name);
  }
  // Leave off any photo that could not be written, so no place shows a blank print.
  const places = doc.places.map((p) => ({ ...p, photos: p.photos.filter((ph) => ph.kind === 'art' || written.has(ph.file)) }));
  // How the map is drawn is this phone's choice (and may be a Pro one), not the backup's.
  const mapStyle = store.get().settings.mapStyle;
  const next: Doc = { ...doc, places, settings: { ...doc.settings, mapStyle } };
  await store.replace(next);
  await sweepPhotos(photoFiles(next));
}

async function swap(doc: Doc): Promise<Doc> {
  await store.replace(doc);
  await sweepPhotos(photoFiles(doc));
  return doc;
}

export async function loadSample(size: 'starter' | 'full'): Promise<Doc> {
  return swap(sampleDoc(Date.now(), size, { mapStyle: store.get().settings.mapStyle }));
}

export async function eraseEverything(): Promise<void> {
  await swap(emptyDoc(Date.now(), { onboarded: true, mapStyle: store.get().settings.mapStyle }));
}

/** Deletes photo files that a saved change no longer uses. */
export function dropPhotos(names: string[]): void {
  if (names.length > 0) void deletePhotoFiles(names);
}
