import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { parsePhotoEntryName, type PhotoSize } from '@/domain/backup';
import { newId } from '@/domain/ids';
import type { Photo } from '@/domain/types';

// Photo files on the iPhone: each photo is kept twice in the app's documents
// folder, a full copy (longest side 1600 px) and a small one for lists and the
// report. The web preview has its own version: photos.web.ts.

export const FULL_SIDE = 1600;
export const THUMB_SIDE = 480;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

function folder(name: 'photos' | 'photos-restore'): Directory {
  const dir = new Directory(Paths.document, 'plainproof', name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fileName(id: string, size: PhotoSize): string {
  return size === 'thumb' ? `${id}_t.jpg` : `${id}.jpg`;
}

function fileFor(id: string, size: PhotoSize): File {
  return new File(folder('photos'), fileName(id, size));
}

async function render(source: PickedImage, side: number, quality: number, dest: File): Promise<{ width: number; height: number }> {
  const context = ImageManipulator.manipulate(source.uri);
  const longest = Math.max(source.width, source.height);
  if (longest === 0) context.resize({ width: side });
  else if (longest > side) context.resize(source.width >= source.height ? { width: side } : { height: side });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  await new File(saved.uri).move(dest, { overwrite: true });
  return { width: saved.width, height: saved.height };
}

/** Copies a picked image into the app, scaled down, and returns its record. */
export async function importPhoto(source: PickedImage): Promise<Photo> {
  const id = newId();
  const full = await render(source, FULL_SIDE, 0.82, fileFor(id, 'full'));
  await render({ uri: fileFor(id, 'full').uri, ...full }, THUMB_SIDE, 0.7, fileFor(id, 'thumb'));
  return { id, ...full };
}

/** Where to show a photo from. On the iPhone this is known straight away. */
export function usePhotoUri(id: string | null | undefined, size: PhotoSize): string | null {
  return id ? fileFor(id, size).uri : null;
}

export async function readPhotoBase64(id: string, size: PhotoSize): Promise<string | null> {
  const file = fileFor(id, size);
  try {
    return file.exists ? await file.base64() : null;
  } catch {
    return null;
  }
}

export async function readPhotoBytes(id: string, size: PhotoSize): Promise<Uint8Array | null> {
  const file = fileFor(id, size);
  try {
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

export async function deletePhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    for (const size of ['full', 'thumb'] as const) {
      const file = fileFor(id, size);
      if (file.exists) file.delete();
    }
  }
}

/** Deletes photo files nothing points at any more. Returns how many photos went. */
export async function removeOrphanPhotos(inUse: Set<string>): Promise<number> {
  const gone = new Set<string>();
  for (const entry of folder('photos').list()) {
    if (!(entry instanceof File)) continue;
    const parsed = parsePhotoEntryName(`photos/${entry.name}`);
    if (parsed && !inUse.has(parsed.id)) {
      entry.delete();
      gone.add(parsed.id);
    }
  }
  return gone.size;
}

export interface PhotoRestore {
  write(id: string, size: PhotoSize, data: Uint8Array): Promise<void>;
  /** Moves everything written so far into place. */
  commit(): Promise<void>;
  /** Throws away everything written so far. */
  abort(): Promise<void>;
}

/**
 * Restored photos land in a side folder first and only move into place once
 * the whole backup has been read, so a bad file can't leave things half done.
 */
export function beginPhotoRestore(): PhotoRestore {
  const staging = folder('photos-restore');
  for (const entry of staging.list()) entry.delete();
  return {
    async write(id, size, data) {
      const file = new File(staging, fileName(id, size));
      if (file.exists) file.delete();
      file.create();
      await file.write(data);
    },
    async commit() {
      const dest = folder('photos');
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
