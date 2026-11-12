import { parseDoc } from './doc';
import type { Doc } from './types';

// A backup is one small file the person keeps wherever they like. It holds the
// whole document and nothing about Pro: a purchase belongs to the Apple
// Account, not to the file.

export const BACKUP_KIND = 'plainkeep-backup';

export function backupName(ymd: string): string {
  return `Plainkeep backup ${ymd}.json`;
}

export function makeBackup(doc: Doc, now: number): string {
  return JSON.stringify({ kind: BACKUP_KIND, version: 1, exportedAt: now, doc }, null, 1);
}

export type BackupProblem = 'not-a-backup' | 'newer-version' | 'damaged';

export type BackupRead = { ok: true; doc: Doc; exportedAt: number | null } | { ok: false; problem: BackupProblem };

export function readBackup(text: string, now: number): BackupRead {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, problem: 'not-a-backup' };
  }
  if (typeof value !== 'object' || value === null) return { ok: false, problem: 'not-a-backup' };
  const file = value as { kind?: unknown; version?: unknown; exportedAt?: unknown; doc?: unknown };
  if (file.kind !== BACKUP_KIND) return { ok: false, problem: 'not-a-backup' };
  if (typeof file.version === 'number' && file.version > 1) return { ok: false, problem: 'newer-version' };
  try {
    const doc = parseDoc(file.doc, now);
    // Restoring a backup is not a first run, whatever the file says.
    return { ok: true, doc: { ...doc, settings: { ...doc.settings, onboarded: true } }, exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : null };
  } catch (e) {
    return { ok: false, problem: e instanceof Error && /newer version/.test(e.message) ? 'newer-version' : 'damaged' };
  }
}

export const BACKUP_PROBLEM_TEXT: Record<BackupProblem, { title: string; message: string }> = {
  'not-a-backup': { title: 'That isn’t a Plainkeep backup', message: 'Choose a file named “Plainkeep backup” that this app made.' },
  'newer-version': { title: 'This backup is from a newer version', message: 'Update Plainkeep from the App Store, then restore it again.' },
  damaged: { title: 'The backup couldn’t be read', message: 'The file is damaged. If you have an earlier backup, try that one.' },
};
