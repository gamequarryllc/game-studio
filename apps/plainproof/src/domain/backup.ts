import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate';

import { DocError, parseDoc } from './doc';
import { isSafeId } from './ids';
import { libraryFileNames, libraryOf, libraryPhotoIds, libraryVideos, parseLibrary, type Library } from './library';

// A backup is one .zip: everything the app keeps as JSON (every place and its
// inventory) plus every photo file. It is made and read in pieces so a large
// inventory never has to sit in memory at once.
//
// Format 1 held one home's document under "doc". Format 2 holds the library
// under "library". Both are read; only format 2 is written.

export const BACKUP_FORMAT = 'plainproof-backup';
export const BACKUP_FORMAT_VERSION = 2;
export const MANIFEST_NAME = 'plainproof.json';

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

// Videos and policy documents: files/<id>.<ext>.
const ATTACHMENT_RX = /^([0-9a-z_-]+)\.(mov|mp4|pdf|jpg)$/;

export function isAttachmentName(name: string): boolean {
  const m = ATTACHMENT_RX.exec(name);
  return m !== null && isSafeId(m[1]);
}

export function fileEntryName(name: string): string {
  return `files/${name}`;
}

export function parseFileEntryName(entry: string): string | null {
  if (!entry.startsWith('files/')) return null;
  const name = entry.slice('files/'.length);
  return isAttachmentName(name) ? name : null;
}

/**
 * A zip without the zip64 extension (fflate writes none) cannot pass 4 GB. Photos and documents always go in;
 * videos go in while the backup stays under this, and the rest are left out and counted.
 */
export const BACKUP_VIDEO_BUDGET = 3_500_000_000;

export function backupFileName(now: number): string {
  const d = new Date(now);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Plainproof-backup-${stamp}.zip`;
}

export function buildManifest(library: Library, now: number, appVersion: string): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    appVersion,
    library,
  });
}

export function parseManifest(text: string, now: number): Library {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocError('This file is not a Plainproof backup.', 'not-a-document');
  }
  const m = raw as { format?: unknown; formatVersion?: unknown; doc?: unknown; library?: unknown } | null;
  if (!m || typeof m !== 'object' || m.format !== BACKUP_FORMAT) {
    throw new DocError('This file is not a Plainproof backup.', 'not-a-document');
  }
  if (typeof m.formatVersion === 'number' && m.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new DocError('This backup was made by a newer version of Plainproof.', 'too-new');
  }
  // A backup from before places existed holds one home.
  if (m.library === undefined) return libraryOf(parseDoc(m.doc, now));
  const library = m.library as { format?: unknown } | null;
  if (!library || typeof library !== 'object') throw new DocError('This file is not a Plainproof backup.', 'not-a-document');
  return parseLibrary({ ...library, format: 'plainproof-library' }, now);
}

export interface ZipWriter {
  add(name: string, data: Uint8Array, compress?: boolean): void;
  /** Starts an entry whose data arrives in pieces (stored as is); push the last piece with final true. */
  stream(name: string): { push(chunk: Uint8Array, final: boolean): void };
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
    stream(name) {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      return {
        push(chunk, final) {
          entry.push(chunk, final);
          if (failure) throw failure;
        },
      };
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

export type ChunkSink = (chunk: Uint8Array, final: boolean) => void;

/**
 * Reads a zip piece by piece and hands over each file as soon as it is complete. A file `onStream` takes (it
 * returns a sink for it) is handed over in pieces instead, so a large video never sits in memory whole.
 */
export function createZipReader(onFile: (name: string, data: Uint8Array) => void, onStream?: (name: string) => ChunkSink | null): ZipReader {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let failure: Error | null = null;
  unzip.onfile = (file) => {
    const sink = onStream ? onStream(file.name) : null;
    const parts: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      if (sink) {
        sink(chunk, final);
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
        throw new DocError('This file is not a Plainproof backup.', 'not-a-document');
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
  /** Reads a video or document in pieces. False when the file is missing. */
  readFile?(name: string, onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void): Promise<boolean>;
}

export interface BackupResult {
  photos: number;
  /** Photos the inventory names that were not on the phone. */
  missing: number;
  /** Videos and documents in the backup. */
  files: number;
  /** Videos and documents the inventory names that were not on the phone. */
  missingFiles: number;
  /** Videos left out because the backup would have passed what a zip can hold. */
  skippedVideos: number;
}

/**
 * Writes a whole backup through `onChunk`, awaiting `flush` between photos so
 * the caller can put each piece on disk before the next one is read.
 */
export async function writeBackup(
  library: Library,
  source: BackupSource,
  opts: { now: number; appVersion: string; onChunk: (chunk: Uint8Array) => void; flush?: () => Promise<void>; videoBudget?: number },
): Promise<BackupResult> {
  const writer = createZipWriter(opts.onChunk);
  writer.add(MANIFEST_NAME, textToBytes(buildManifest(library, opts.now, opts.appVersion)), true);
  let photos = 0;
  let missing = 0;
  let written = 0;
  for (const id of libraryPhotoIds(library)) {
    const full = await source.readPhoto(id, 'full');
    if (!full) {
      missing += 1;
      continue;
    }
    writer.add(photoEntryName(id, 'full'), full);
    const thumb = await source.readPhoto(id, 'thumb');
    if (thumb) writer.add(photoEntryName(id, 'thumb'), thumb);
    photos += 1;
    written += full.length + (thumb?.length ?? 0);
    if (opts.flush) await opts.flush();
  }

  let files = 0;
  let missingFiles = 0;
  let skippedVideos = 0;
  if (source.readFile) {
    const videoSizes = new Map(libraryVideos(library).map((v) => [v.name, v.bytes]));
    const budget = opts.videoBudget ?? BACKUP_VIDEO_BUDGET;
    // Documents first: they are small and always go in. Then videos, smallest first, while they fit.
    const names = [...libraryFileNames(library)].sort((a, b) => (videoSizes.get(a) ?? -1) - (videoSizes.get(b) ?? -1));
    for (const name of names) {
      const videoBytes = videoSizes.get(name);
      if (videoBytes !== undefined && written + videoBytes > budget) {
        skippedVideos += 1;
        continue;
      }
      let entry: { push(chunk: Uint8Array, final: boolean): void } | null = null;
      const found = await source.readFile(name, async (chunk, final) => {
        if (!entry) entry = writer.stream(fileEntryName(name));
        entry.push(chunk, final);
        written += chunk.length;
        if (opts.flush) await opts.flush();
      });
      if (found) files += 1;
      else missingFiles += 1;
    }
  }
  writer.end();
  if (opts.flush) await opts.flush();
  return { photos, missing, files, missingFiles, skippedVideos };
}

export interface RestoreResult {
  library: Library;
  /** Photo files found in the backup that the document uses. */
  photos: { id: string; size: PhotoSize; data: Uint8Array }[];
}

/**
 * Collects what a backup holds. `onPhoto` is called for each photo the
 * document will need, as it is read, so photos can go straight to disk.
 * The library itself is only returned at the end, once everything parsed.
 */
export function createBackupReader(
  now: number,
  onPhoto: (id: string, size: PhotoSize, data: Uint8Array) => void,
  /** For a video or document: a sink its pieces go to, or null to skip it. */
  onFile?: (name: string) => ChunkSink | null,
): { push(chunk: Uint8Array, final: boolean): void; finish(): Library } {
  let manifest: string | null = null;
  const reader = createZipReader(
    (name, data) => {
      if (name === MANIFEST_NAME) {
        manifest = bytesToText(data);
        return;
      }
      const photo = parsePhotoEntryName(name);
      if (photo) onPhoto(photo.id, photo.size, data);
    },
    (entry) => {
      const name = parseFileEntryName(entry);
      if (name === null) return null;
      // A file the app does not take is still read through, and dropped.
      return (onFile ? onFile(name) : null) ?? (() => {});
    },
  );
  return {
    push: (chunk, final) => reader.push(chunk, final),
    finish() {
      if (manifest === null) throw new DocError('This file is not a Plainproof backup.', 'not-a-document');
      return parseManifest(manifest, now);
    },
  };
}
