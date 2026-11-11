import Constants from 'expo-constants';

import { markBackup, markReport } from '@/domain/actions';
import { backupFileName, createBackupReader, writeBackup } from '@/domain/backup';
import { buildCsv } from '@/domain/csv';
import { emptyDoc } from '@/domain/doc';
import { libraryOf, libraryPhotoIds, mapDocs, removePlace, totalItems, totalRooms } from '@/domain/library';
import { buildReportHtml, reportFileName, reportPhotoIds } from '@/domain/report';
import { heavyHome, sampleHome } from '@/domain/sample';
import type { Doc, Id } from '@/domain/types';
import { cancelReport, createBackupSink, deliverReport, pickBackupFile, prepareReport, shareTextFile } from '@/platform/exporter';
import { beginPhotoRestore, deletePhotos, readPhotoBase64, readPhotoBytes, removeOrphanPhotos } from '@/platform/photos';

import { store } from './store';

// The jobs that touch both the document and the phone's files.

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0';
}

export async function makeReport(opts: { includePhotos: boolean; includeReceipts: boolean }): Promise<void> {
  const target = prepareReport();
  try {
    const doc = store.get();
    const now = Date.now();
    const wanted = reportPhotoIds(doc, opts);
    const photoData: Record<string, string> = {};
    for (const id of wanted.thumbs) {
      const b64 = await readPhotoBase64(id, 'thumb');
      if (b64) photoData[id] = `data:image/jpeg;base64,${b64}`;
    }
    for (const id of wanted.full) {
      const b64 = await readPhotoBase64(id, 'full');
      if (b64) photoData[id] = `data:image/jpeg;base64,${b64}`;
    }
    const html = buildReportHtml(doc, { ...opts, generatedAt: now, photoData });
    await deliverReport(target, html, reportFileName(doc, now));
    store.update((d) => markReport(d, now));
  } catch (e) {
    cancelReport(target);
    throw e;
  }
}

export async function exportSpreadsheet(): Promise<void> {
  const doc = store.get();
  const name = `${reportFileName(doc, Date.now())}.csv`;
  await shareTextFile(name, 'text/csv', 'public.comma-separated-values-text', buildCsv(doc));
}

export async function backUp(): Promise<{ photos: number; missing: number }> {
  await store.flush();
  // A backup holds every place, not only the one being looked at.
  const library = store.library();
  const now = Date.now();
  const sink = createBackupSink(backupFileName(now));
  try {
    const result = await writeBackup(
      library,
      { readPhoto: readPhotoBytes },
      { now, appVersion: appVersion(), onChunk: sink.onChunk, flush: sink.flush },
    );
    await sink.finish();
    store.updateLibrary((lib) => mapDocs(lib, (d) => markBackup(d, now)));
    return result;
  } catch (e) {
    await sink.abort();
    throw e;
  }
}

export type RestoreOutcome = { kind: 'cancelled' } | { kind: 'restored'; items: number; rooms: number; places: number; photos: number };

/** Reads a backup the person picks and, if all of it is good, replaces everything (every place) with it. */
export async function restoreFromBackup(
  confirmReplace: (found: { items: number; rooms: number; places: number }) => Promise<boolean>,
): Promise<RestoreOutcome> {
  const picked = await pickBackupFile();
  if (!picked) return { kind: 'cancelled' };
  const staging = beginPhotoRestore();
  try {
    const seen = new Set<string>();
    const writes: Promise<void>[] = [];
    const reader = createBackupReader(Date.now(), (id, size, data) => {
      if (size === 'full') seen.add(id);
      writes.push(staging.write(id, size, data));
    });
    await picked.read(async (chunk, final) => {
      reader.push(chunk, final);
      await Promise.all(writes.splice(0));
    });
    await Promise.all(writes);
    const library = reader.finish();
    const found = { items: totalItems(library), rooms: totalRooms(library), places: library.places.length };
    if (!(await confirmReplace(found))) {
      await staging.abort();
      return { kind: 'cancelled' };
    }
    await staging.commit();
    await store.replace(library);
    const inUse = libraryPhotoIds(library);
    await removeOrphanPhotos(inUse);
    return { kind: 'restored', ...found, photos: [...inUse].filter((id) => seen.has(id)).length };
  } catch (e) {
    await staging.abort();
    throw e;
  }
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
  return doc;
}

export async function eraseEverything(): Promise<void> {
  const currency = store.get().settings.currency;
  await store.replace(libraryOf(emptyDoc(Date.now(), currency)));
  await removeOrphanPhotos(new Set()).catch(() => {});
}

/** Removes a place, everything in it and its photo files. The last place stays. */
export async function deletePlace(id: Id): Promise<void> {
  store.updateLibrary((lib) => removePlace(lib, id));
  await store.flush();
  await removeOrphanPhotos(libraryPhotoIds(store.library())).catch(() => {});
}
