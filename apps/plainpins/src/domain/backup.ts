import { isSafeFileName, parseDoc, photoFiles } from './doc';
import type { Doc } from './types';

// A backup is one file the person keeps wherever they like. It holds the whole
// map and its photos, and nothing about Pro: a purchase belongs to the Apple
// Account, not to the file.

export const BACKUP_KIND = 'plainpins-backup';
export const BACKUP_NAME = 'Plainpins backup';

export function backupName(ymd: string): string {
  return `${BACKUP_NAME} ${ymd}.json`;
}

/** `photos` maps a photo's file name to its bytes in base64. Photos that could not be read are simply absent. */
export function makeBackup(doc: Doc, photos: Record<string, string>, now: number): string {
  return JSON.stringify({ kind: BACKUP_KIND, version: 1, exportedAt: now, doc, photos });
}

export type BackupProblem = 'not-a-backup' | 'newer-version' | 'damaged';

export type BackupRead = { ok: true; doc: Doc; photos: Record<string, string>; exportedAt: number | null } | { ok: false; problem: BackupProblem };

export function readBackup(text: string, now: number): BackupRead {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, problem: 'not-a-backup' };
  }
  if (typeof value !== 'object' || value === null) return { ok: false, problem: 'not-a-backup' };
  const file = value as { kind?: unknown; version?: unknown; exportedAt?: unknown; doc?: unknown; photos?: unknown };
  if (file.kind !== BACKUP_KIND) return { ok: false, problem: 'not-a-backup' };
  if (typeof file.version === 'number' && file.version > 1) return { ok: false, problem: 'newer-version' };
  try {
    const parsed = parseDoc(file.doc, now);
    const wanted = new Set(photoFiles(parsed));
    const photos: Record<string, string> = {};
    if (typeof file.photos === 'object' && file.photos !== null) {
      for (const [name, data] of Object.entries(file.photos as Record<string, unknown>)) {
        if (wanted.has(name) && isSafeFileName(name) && typeof data === 'string' && /^[A-Za-z0-9+/=]+$/.test(data)) photos[name] = data;
      }
    }
    // A photo whose bytes are not in the file would show as a blank square for ever: leave it off the place.
    const places = parsed.places.map((p) => ({ ...p, photos: p.photos.filter((ph) => ph.kind === 'art' || photos[ph.file] !== undefined) }));
    // Restoring a backup is not a first run, whatever the file says.
    const doc: Doc = { ...parsed, places, settings: { ...parsed.settings, onboarded: true } };
    return { ok: true, doc, photos, exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : null };
  } catch (e) {
    return { ok: false, problem: e instanceof Error && /newer version/.test(e.message) ? 'newer-version' : 'damaged' };
  }
}

export const BACKUP_PROBLEM_TEXT: Record<BackupProblem, { title: string; message: string }> = {
  'not-a-backup': { title: 'That isn’t a Plainpins backup', message: 'Choose a file named “Plainpins backup” that this app made.' },
  'newer-version': { title: 'This backup is from a newer version', message: 'Update the app from the App Store, then restore it again.' },
  damaged: { title: 'The backup couldn’t be read', message: 'The file is damaged. If you have an earlier backup, try that one.' },
};
