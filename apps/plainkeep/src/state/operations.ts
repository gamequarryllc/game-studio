import Constants from 'expo-constants';

import { BACKUP_PROBLEM_TEXT, backupName, makeBackup, readBackup, type BackupProblem } from '@/domain/backup';
import { logCsv } from '@/domain/csv';
import { todayYmd } from '@/domain/dates';
import { reportBaseName, serviceRecordHtml } from '@/domain/report';
import { sampleDoc } from '@/domain/sample';
import type { Doc } from '@/domain/types';
import { cancelReport, deliverReport, pickTextFile, prepareReport, shareTextFile } from '@/platform/exporter';

import { freshDoc, store } from './store';

// The things the app does that reach outside the document: files in and out.

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0';
}

/** Makes one thing's service record and hands it to the share sheet as a PDF. */
export async function makeServiceRecord(thingId: string): Promise<void> {
  const target = prepareReport();
  try {
    const doc = store.get();
    const now = Date.now();
    const thing = doc.things.find((t) => t.id === thingId);
    if (!thing) throw new Error('That thing is no longer here.');
    await deliverReport(target, serviceRecordHtml(doc, thingId, now), reportBaseName(thing, now));
  } catch (e) {
    cancelReport(target);
    throw e;
  }
}

export async function exportLog(): Promise<void> {
  const doc = store.get();
  await shareTextFile(`Plainkeep log ${todayYmd(Date.now())}.csv`, 'text/csv', 'public.comma-separated-values-text', logCsv(doc));
}

export async function backUp(): Promise<void> {
  await store.flush();
  const now = Date.now();
  await shareTextFile(backupName(todayYmd(now)), 'application/json', 'public.json', makeBackup(store.get(), now));
}

export type RestoreResult = { ok: true; doc: Doc } | { ok: false; cancelled: true } | { ok: false; cancelled: false; problem: BackupProblem };

/** Lets the person choose a backup and reads it. Nothing is replaced until `applyRestore` is called. */
export async function chooseBackup(): Promise<RestoreResult> {
  const picked = await pickTextFile();
  if (!picked) return { ok: false, cancelled: true };
  const read = readBackup(picked.text, Date.now());
  if (!read.ok) return { ok: false, cancelled: false, problem: read.problem };
  return { ok: true, doc: read.doc };
}

export function restoreProblemText(problem: BackupProblem): { title: string; message: string } {
  return BACKUP_PROBLEM_TEXT[problem];
}

export async function applyRestore(doc: Doc): Promise<void> {
  // Whether reminders are on is this phone's choice, not the backup's.
  const reminders = store.get().settings.reminders;
  await store.replace({ ...doc, settings: { ...doc.settings, reminders } });
}

export async function loadSample(size: 'starter' | 'full'): Promise<Doc> {
  const current = store.get().settings;
  const doc = sampleDoc(Date.now(), size, { currency: current.currency, distanceUnit: current.distanceUnit, reminders: current.reminders });
  await store.replace(doc);
  return doc;
}

export async function eraseEverything(): Promise<void> {
  await store.replace(freshDoc(Date.now()));
}
