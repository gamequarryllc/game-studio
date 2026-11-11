import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate';

import { DocError, parseDoc, photoIdsInUse } from './doc';
import { isSafeId } from './ids';
import type { Doc } from './types';

// A backup is one .zip: the document as JSON plus every photo file. It is made
// and read in pieces so a large inventory never has to sit in memory at once.

export const BACKUP_FORMAT = 'roomfile-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_NAME = 'roomfile.json';

export type PhotoSize = 'full' | 'thumb';

export function photoEntryName(id: string, size: PhotoSize): string {
  return size === 'thumb' ? `photos/${id}_t.jpg` : `photos/${id}.jpg`;
}

const PHOTO_ENTRY_RX = /^photos\/([0-9a-z_-]+?)(_t)?\.jpg$/;

export function parsePhotoEntryName(name: string): { id: string; size: PhotoSize } | null {
  const m = PHOTO_ENTRY_RX.exec(name);
  if (!m || !isSafeId(m[1])) return null;
  return { id: m[1], size: m[2] ? 'thumb' : 'full' };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Roomfile-backup-${stamp}.zip`;
}

export function buildManifest(doc: Doc, now: number, appVersion: string): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    appVersion,
    doc,
  });
}

export function parseManifest(text: string, now: number): Doc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocError('This file is not a Roomfile backup.', 'not-a-document');
  }
  const m = raw as { format?: unknown; formatVersion?: unknown; doc?: unknown } | null;
  if (!m || typeof m !== 'object' || m.format !== BACKUP_FORMAT) {
    throw new DocError('This file is not a Roomfile backup.', 'not-a-document');
  }
  if (typeof m.formatVersion === 'number' && m.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new DocError('This backup was made by a newer version of Roomfile.', 'too-new');
  }
  return parseDoc(m.doc, now);
}

export interface ZipWriter {
  add(name: string, data: Uint8Array, compress?: boolean): void;
  end(): void;
}

/** Streams a zip out through `onChunk`. Photos are stored as they are (JPEG doesn't shrink). */
export function createZipWriter(onChunk: (chunk: Uint8Array) => void): ZipWriter {
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else onChunk(chunk);
  });
  return {
    add(name, data, compress = false) {
      const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(entry);
      entry.push(data, true);
      if (failure) throw failure;
    },
    end() {
      zip.end();
      if (failure) throw failure;
    },
  };
}

export interface ZipReader {
  push(chunk: Uint8Array, final: boolean): void;
}

/** Reads a zip piece by piece and hands over each file as soon as it is complete. */
export function createZipReader(onFile: (name: string, data: Uint8Array) => void): ZipReader {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let failure: Error | null = null;
  unzip.onfile = (file) => {
    const parts: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      parts.push(chunk);
      if (final) onFile(file.name, concat(parts));
    };
    file.start();
  };
  return {
    push(chunk, final) {
      try {
        unzip.push(chunk, final);
      } catch {
        throw new DocError('This file is not a Roomfile backup.', 'not-a-document');
      }
      if (failure) throw new DocError('This backup is damaged and could not be read.', 'not-a-document');
    },
  };
}

export function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const textToBytes = strToU8;
export const bytesToText = strFromU8;

export interface BackupSource {
  readPhoto(id: string, size: PhotoSize): Promise<Uint8Array | null>;
}

/**
 * Writes a whole backup through `onChunk`, awaiting `flush` between photos so
 * the caller can put each piece on disk before the next one is read.
 */
export async function writeBackup(
  doc: Doc,
  source: BackupSource,
  opts: { now: number; appVersion: string; onChunk: (chunk: Uint8Array) => void; flush?: () => Promise<void> },
): Promise<{ photos: number; missing: number }> {
  const writer = createZipWriter(opts.onChunk);
  writer.add(MANIFEST_NAME, textToBytes(buildManifest(doc, opts.now, opts.appVersion)), true);
  let photos = 0;
  let missing = 0;
  for (const id of photoIdsInUse(doc)) {
    const full = await source.readPhoto(id, 'full');
    if (!full) {
      missing += 1;
      continue;
    }
    writer.add(photoEntryName(id, 'full'), full);
    const thumb = await source.readPhoto(id, 'thumb');
    if (thumb) writer.add(photoEntryName(id, 'thumb'), thumb);
    photos += 1;
    if (opts.flush) await opts.flush();
  }
  writer.end();
  if (opts.flush) await opts.flush();
  return { photos, missing };
}

export interface RestoreResult {
  doc: Doc;
  /** Photo files found in the backup that the document uses. */
  photos: { id: string; size: PhotoSize; data: Uint8Array }[];
}

/**
 * Collects what a backup holds. `onPhoto` is called for each photo the
 * document will need, as it is read, so photos can go straight to disk.
 * The document itself is only returned at the end, once everything parsed.
 */
export function createBackupReader(
  now: number,
  onPhoto: (id: string, size: PhotoSize, data: Uint8Array) => void,
): { push(chunk: Uint8Array, final: boolean): void; finish(): Doc } {
  let manifest: string | null = null;
  const reader = createZipReader((name, data) => {
    if (name === MANIFEST_NAME) {
      manifest = bytesToText(data);
      return;
    }
    const photo = parsePhotoEntryName(name);
    if (photo) onPhoto(photo.id, photo.size, data);
  });
  return {
    push: (chunk, final) => reader.push(chunk, final),
    finish() {
      if (manifest === null) throw new DocError('This file is not a Roomfile backup.', 'not-a-document');
      return parseManifest(manifest, now);
    },
  };
}
