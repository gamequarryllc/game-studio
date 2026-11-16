import Constants from 'expo-constants';

import { findClaim, markBackup, markReport } from '@/domain/actions';
import { backupFileName, createBackupReader, createZipWriter, textToBytes, writeBackup, type BackupResult, type ChunkSink } from '@/domain/backup';
import { claimPackageName, claimPackagePlan } from '@/domain/claimPackage';
import { buildCsv } from '@/domain/csv';
import { emptyDoc } from '@/domain/doc';
import { libraryFileNames, libraryOf, libraryPhotoIds, mapDocs, removePlace, totalItems, totalRooms } from '@/domain/library';
import { buildReportHtml, claimDoc, reportFileName, reportPhotoIds } from '@/domain/report';
import { heavyHome, sampleHome } from '@/domain/sample';
import type { Doc, Id } from '@/domain/types';
import { beginAttachmentRestore, deleteAttachments, readAttachment, removeOrphanAttachments } from '@/platform/attachments';
import { REPORT_EXT, cancelReport, createBackupSink, deliverReport, pickBackupFile, prepareReport, renderReportFile, shareTextFile } from '@/platform/exporter';
import { beginPhotoRestore, deletePhotos, readPhotoBase64, readPhotoBytes, removeOrphanPhotos } from '@/platform/photos';

import { store } from './store';

// The jobs that touch both the document and the phone's files.

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0';
}

export interface ReportChoice {
  includePhotos: boolean;
  includeReceipts: boolean;
  includeAllPhotos: boolean;
  /** A claim's schedule of loss: only that claim's items. */
  claimId?: Id | null;
}

/** Reads the photos a report needs, as data: URIs. */
async function reportPhotos(doc: Doc, opts: ReportChoice): Promise<Record<string, string>> {
  const wanted = reportPhotoIds(opts.claimId != null ? claimDoc(doc, opts.claimId) : doc, opts);
  const photoData: Record<string, string> = {};
  for (const id of wanted.thumbs) {
    const b64 = await readPhotoBase64(id, 'thumb');
    if (b64) photoData[id] = `data:image/jpeg;base64,${b64}`;
  }
  for (const id of new Set(wanted.full)) {
    const b64 = await readPhotoBase64(id, 'full');
    if (b64) photoData[id] = `data:image/jpeg;base64,${b64}`;
  }
  return photoData;
}

export async function makeReport(opts: ReportChoice): Promise<void> {
  const target = prepareReport();
  try {
    const doc = store.get();
    const now = Date.now();
    const photoData = await reportPhotos(doc, opts);
    const html = buildReportHtml(doc, { ...opts, generatedAt: now, photoData, appVersion: appVersion() });
    await deliverReport(target, html, reportFileName(doc, now, findClaim(doc, opts.claimId)));
    store.update((d) => markReport(d, now));
  } catch (e) {
    cancelReport(target);
    throw e;
  }
}

/** The inventory as a spreadsheet, or with a claim id, that claim's items. */
export async function exportSpreadsheet(claimId: Id | null = null): Promise<void> {
  const doc = store.get();
  const claim = findClaim(doc, claimId);
  const name = `${reportFileName(doc, Date.now(), claim)}.csv`;
  await shareTextFile(name, 'text/csv', 'public.comma-separated-values-text', buildCsv(doc, { claim }));
}

/** The claim package: one zip with the schedule of loss, the spreadsheet, and the claim's photos, videos and policy in folders. */
export async function makeClaimPackage(claimId: Id): Promise<void> {
  await store.flush();
  const doc = store.get();
  const claim = findClaim(doc, claimId);
  if (!claim) throw new Error('That claim is gone.');
  const now = Date.now();
  const version = appVersion();
  const plan = claimPackagePlan(doc, claim, { generatedAt: now, reportExt: REPORT_EXT, appVersion: version });
  const sink = createBackupSink(`${claimPackageName(doc, claim, now)}.zip`);
  try {
    const writer = createZipWriter(sink.onChunk);
    for (const entry of plan) {
      const { source } = entry;
      if (source.kind === 'report') {
        const choice: ReportChoice = { claimId: claim.id, includePhotos: true, includeReceipts: true, includeAllPhotos: true };
        const html = buildReportHtml(doc, { ...choice, generatedAt: now, photoData: await reportPhotos(doc, choice), appVersion: version });
        writer.add(entry.path, await renderReportFile(html), true);
      } else if (source.kind === 'csv') {
        writer.add(entry.path, textToBytes(buildCsv(doc, { claim })), true);
      } else if (source.kind === 'text') {
        writer.add(entry.path, textToBytes(source.text), true);
      } else if (source.kind === 'photo') {
        const bytes = await readPhotoBytes(source.id, 'full');
        if (bytes) writer.add(entry.path, bytes);
      } else {
        let stream: { push(chunk: Uint8Array, final: boolean): void } | null = null;
        await readAttachment(source.name, async (chunk, final) => {
          if (!stream) stream = writer.stream(entry.path);
          stream.push(chunk, final);
          await sink.flush();
        });
      }
      await sink.flush();
    }
    writer.end();
    await sink.finish();
  } catch (e) {
    await sink.abort();
    throw e;
  }
}

/** Writes a backup of every place. With keep, the zip is left in the outbox (for iCloud Drive) and its uri returned. */
async function writeLibraryBackup(opts: { keep?: boolean } = {}): Promise<BackupResult & { uri: string; at: number }> {
  await store.flush();
  // A backup holds every place, not only the one being looked at.
  const library = store.library();
  const now = Date.now();
  const sink = createBackupSink(backupFileName(now), opts);
  try {
    const result = await writeBackup(
      library,
      { readPhoto: readPhotoBytes, readFile: readAttachment },
      { now, appVersion: appVersion(), onChunk: sink.onChunk, flush: sink.flush },
    );
    const uri = await sink.finish();
    return { ...result, uri, at: now };
  } catch (e) {
    await sink.abort();
    throw e;
  }
}

export async function backUp(): Promise<BackupResult> {
  const result = await writeLibraryBackup();
  store.updateLibrary((lib) => mapDocs(lib, (d) => markBackup(d, result.at)));
  return result;
}

/** A backup made for iCloud Drive: the zip stays on disk for the caller to copy, then drop. */
export async function backUpToFile(): Promise<BackupResult & { uri: string; at: number }> {
  return writeLibraryBackup({ keep: true });
}

/** Marks every place as backed up at `at` (after a backup reached iCloud Drive). */
export function markBackedUp(at: number): void {
  store.updateLibrary((lib) => mapDocs(lib, (d) => markBackup(d, at)));
}

export type RestoreOutcome =
  | { kind: 'cancelled' }
  | {
      kind: 'restored';
      items: number;
      rooms: number;
      places: number;
      photos: number;
      /** Photos the inventory names that the file did not hold. */
      missing: number;
      /** Walk-through videos restored. */
      videos: number;
      /** Policy documents restored. */
      documents: number;
      /** Videos and documents the inventory names that the file did not hold (a backup may leave out videos too big for it). */
      missingFiles: number;
    };

/** Reads a backup the person picks and, if all of it is good, replaces everything (every place) with it. */
export async function restoreFromBackup(
  confirmReplace: (found: { items: number; rooms: number; places: number }) => Promise<boolean>,
): Promise<RestoreOutcome> {
  const picked = await pickBackupFile();
  if (!picked) return { kind: 'cancelled' };
  const staging = beginPhotoRestore();
  const fileStaging = beginAttachmentRestore();
  try {
    const seen = new Set<string>();
    const seenFiles = new Set<string>();
    const writes: Promise<void>[] = [];
    const reader = createBackupReader(
      Date.now(),
      (id, size, data) => {
        if (size === 'full') seen.add(id);
        writes.push(staging.write(id, size, data));
      },
      (name): ChunkSink => {
        // A file's pieces are written in order, one after another.
        const write = fileStaging.open(name);
        let chain: Promise<void> = Promise.resolve();
        return (chunk, final) => {
          chain = chain.then(() => write(chunk, final));
          writes.push(chain);
          if (final) seenFiles.add(name);
        };
      },
    );
    await picked.read(async (chunk, final) => {
      reader.push(chunk, final);
      await Promise.all(writes.splice(0));
    });
    await Promise.all(writes);
    const library = reader.finish();
    const found = { items: totalItems(library), rooms: totalRooms(library), places: library.places.length };
    if (!(await confirmReplace(found))) {
      await staging.abort();
      await fileStaging.abort();
      return { kind: 'cancelled' };
    }
    await staging.commit();
    await fileStaging.commit();
    // What is on the phone now is exactly what the file holds, so it counts as backed up as of now.
    const restoredAt = Date.now();
    await store.replace(mapDocs(library, (d) => markBackup(d, restoredAt)));
    const inUse = libraryPhotoIds(library);
    await removeOrphanPhotos(inUse);
    const filesInUse = libraryFileNames(library);
    await removeOrphanAttachments(filesInUse).catch(() => 0);
    const photos = [...inUse].filter((id) => seen.has(id)).length;
    const restoredFiles = [...filesInUse].filter((n) => seenFiles.has(n));
    const videos = restoredFiles.filter((n) => /\.(mov|mp4)$/.test(n)).length;
    return { kind: 'restored', ...found, photos, missing: inUse.size - photos, videos, documents: restoredFiles.length - videos, missingFiles: filesInUse.size - restoredFiles.length };
  } catch (e) {
    await staging.abort();
    await fileStaging.abort();
    throw e;
  }
}

/** Deletes video or document files no place points at any more. */
export async function dropFiles(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const inUse = libraryFileNames(store.library());
  await deleteAttachments(names.filter((n) => !inUse.has(n))).catch(() => {});
}

/** Deletes the files of photos that were removed from an item (or of a deleted item). */
export async function dropPhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const inUse = libraryPhotoIds(store.library());
  await deletePhotos(ids.filter((id) => !inUse.has(id))).catch(() => {});
}

export async function loadSample(kind: 'home' | 'heavy'): Promise<Doc> {
  const now = Date.now();
  const doc = kind === 'heavy' ? heavyHome(now) : sampleHome(now);
  doc.settings.currency = store.get().settings.currency;
  await store.replace(libraryOf(doc));
  await removeOrphanPhotos(new Set()).catch(() => {});
  await removeOrphanAttachments(new Set()).catch(() => 0);
  return doc;
}

export async function eraseEverything(): Promise<void> {
  const currency = store.get().settings.currency;
  await store.replace(libraryOf(emptyDoc(Date.now(), currency)));
  await removeOrphanPhotos(new Set()).catch(() => {});
  await removeOrphanAttachments(new Set()).catch(() => 0);
}

/** Removes a place, everything in it and its photo files. The last place stays. */
export async function deletePlace(id: Id): Promise<void> {
  store.updateLibrary((lib) => removePlace(lib, id));
  await store.flush();
  await removeOrphanPhotos(libraryPhotoIds(store.library())).catch(() => {});
  await removeOrphanAttachments(libraryFileNames(store.library())).catch(() => 0);
}
