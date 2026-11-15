import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';

import { isAttachmentName } from '@/domain/backup';

import { native } from './native';
import type { PickedImage } from './photos';

// Files kept beside the photos: walk-through videos and policy documents.
// Each is one file in the app's documents folder, named by its id
// (abc123.mov, def456.pdf, ghi789.jpg). The web preview: attachments.web.ts.

/** Policy pages photographed are kept larger than item photos, so the small print stays readable. */
export const PAGE_SIDE = 2400;
const READ_SIZE = 1024 * 1024;

function folder(name: 'files' | 'files-restore'): Directory {
  const dir = new Directory(Paths.document, 'plainproof', name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fileFor(name: string): File {
  return new File(folder('files'), name);
}

/** Where to play or show a file from. */
export function useAttachmentUri(name: string | null): string | null {
  return name ? fileFor(name).uri : null;
}

/** Copies a picked file (a video, a PDF) into the app. Returns its size in bytes. */
export async function importFile(sourceUri: string, name: string): Promise<number> {
  const dest = fileFor(name);
  if (dest.exists) dest.delete();
  await new File(sourceUri).copy(dest);
  return fileFor(name).size ?? 0;
}

/** Keeps a photographed page of a document, as a JPEG large enough to read. Returns its size in bytes. */
export async function importPageImage(source: PickedImage, name: string): Promise<number> {
  const context = ImageManipulator.manipulate(source.uri);
  const longest = Math.max(source.width, source.height);
  if (longest > PAGE_SIDE) context.resize(source.width >= source.height ? { width: PAGE_SIDE } : { height: PAGE_SIDE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const dest = fileFor(name);
  await new File(saved.uri).move(dest, { overwrite: true });
  return fileFor(name).size ?? 0;
}

export async function attachmentExists(name: string): Promise<boolean> {
  return fileFor(name).exists;
}

export async function deleteAttachments(names: string[]): Promise<void> {
  for (const name of names) {
    const file = fileFor(name);
    if (file.exists) file.delete();
  }
}

/** Deletes files nothing points at any more. */
export async function removeOrphanAttachments(inUse: Set<string>): Promise<number> {
  let gone = 0;
  for (const entry of folder('files').list()) {
    if (entry instanceof File && isAttachmentName(entry.name) && !inUse.has(entry.name)) {
      entry.delete();
      gone += 1;
    }
  }
  return gone;
}

/** Reads a file in pieces (a video can be hundreds of megabytes). False if the file is not there. */
export async function readAttachment(name: string, onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void): Promise<boolean> {
  const file = fileFor(name);
  if (!file.exists) return false;
  const handle = file.open(FileMode.ReadOnly);
  try {
    const size = handle.size ?? 0;
    if (size === 0) {
      await onChunk(new Uint8Array(0), true);
      return true;
    }
    let done = 0;
    while (done < size) {
      const chunk = await handle.readBytes(Math.min(READ_SIZE, size - done));
      if (chunk.length === 0) break;
      done += chunk.length;
      await onChunk(chunk, done >= size);
    }
    if (done < size) await onChunk(new Uint8Array(0), true);
    return true;
  } finally {
    handle.close();
  }
}

/** Shows a document full screen. Without the app's native module (Expo Go) it opens the share sheet, which previews it. */
export async function previewAttachment(name: string, title: string): Promise<void> {
  const file = fileFor(name);
  if (!file.exists) throw new Error('missing');
  if (native) {
    await native.preview(file.uri, title);
    return;
  }
  await Sharing.shareAsync(file.uri, { dialogTitle: title });
}

/** Hands a file to the share sheet. */
export async function shareAttachment(name: string, mimeType: string, UTI: string): Promise<void> {
  await Sharing.shareAsync(fileFor(name).uri, { mimeType, UTI });
}

export interface AttachmentRestore {
  /** Starts a file; write its pieces in order, the last with final true. */
  open(name: string): (chunk: Uint8Array, final: boolean) => Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

/** Restored files wait in a side folder until the whole backup has been read, like photos. */
export function beginAttachmentRestore(): AttachmentRestore {
  const staging = folder('files-restore');
  for (const entry of staging.list()) entry.delete();
  return {
    open(name) {
      const file = new File(staging, name);
      if (file.exists) file.delete();
      file.create();
      return async (chunk) => {
        if (chunk.length > 0) await file.write(chunk, { append: true });
      };
    },
    async commit() {
      const dest = folder('files');
      for (const entry of staging.list()) {
        if (entry instanceof File) await entry.move(new File(dest, entry.name), { overwrite: true });
      }
      if (staging.exists) staging.delete();
    },
    async abort() {
      if (staging.exists) staging.delete();
    },
  };
}
