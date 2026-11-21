import { Directory, File, Paths } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { isSafeFileName } from '@/domain/doc';
import { newId } from '@/domain/ids';
import type { Photo } from '@/domain/types';

// Photos on the iPhone. A chosen picture is copied into the app's own folder
// (scaled down to a size that still looks sharp full-screen), so it stays with
// the place even if the original is later deleted from the camera roll.
// The web preview has its own version of this file: photos.web.ts.

/** The longest side a kept photo may have. */
const LONG_SIDE = 2048;

export const CAN_TAKE_PHOTO = true;

function folder(): Directory {
  const dir = new Directory(Paths.document, 'plainpins', 'photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function keep(asset: { uri: string; width: number; height: number }): Promise<Photo | null> {
  try {
    const long = Math.max(asset.width, asset.height);
    const actions = long > LONG_SIDE ? [{ resize: asset.width >= asset.height ? { width: LONG_SIDE } : { height: LONG_SIDE } }] : [];
    const made = await manipulateAsync(asset.uri, actions, { compress: 0.82, format: SaveFormat.JPEG });
    const id = newId();
    const name = `${id}.jpg`;
    const target = new File(folder(), name);
    if (target.exists) target.delete();
    await new File(made.uri).move(target);
    return { id, kind: 'file', file: name, w: made.width, h: made.height };
  } catch {
    return null;
  }
}

export type PickResult = { photos: Photo[]; failed: number; denied?: boolean };

/** Opens the photo library for up to `max` pictures. Choosing nothing gives an empty list. */
export async function pickFromLibrary(max: number): Promise<PickResult> {
  if (max <= 0) return { photos: [], failed: 0 };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: max > 1, selectionLimit: max, orderedSelection: true, quality: 1, exif: false });
  if (result.canceled) return { photos: [], failed: 0 };
  const photos: Photo[] = [];
  let failed = 0;
  for (const asset of result.assets.slice(0, max)) {
    const photo = await keep(asset);
    if (photo) photos.push(photo);
    else failed += 1;
  }
  return { photos, failed };
}

export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { photos: [], failed: 0, denied: true };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (result.canceled || result.assets.length === 0) return { photos: [], failed: 0 };
  const photo = await keep(result.assets[0]);
  return photo ? { photos: [photo], failed: 0 } : { photos: [], failed: 1 };
}

/** Where a kept photo is, for showing it. */
export async function photoUri(name: string): Promise<string | null> {
  if (!isSafeFileName(name)) return null;
  return new File(folder(), name).uri;
}

export async function deletePhotoFiles(names: string[]): Promise<void> {
  for (const name of names) {
    if (!isSafeFileName(name)) continue;
    try {
      const file = new File(folder(), name);
      if (file.exists) file.delete();
    } catch {
      // A file that will not go is tidied up the next time the app starts.
    }
  }
}

/** Deletes every kept photo the map no longer points at. Run once at start. */
export async function sweepPhotos(keepNames: string[]): Promise<void> {
  try {
    const wanted = new Set(keepNames);
    for (const entry of folder().list()) {
      if (entry instanceof File && !wanted.has(entry.name)) entry.delete();
    }
  } catch {
    // Not worth stopping the app for.
  }
}

export async function readPhotoBase64(name: string): Promise<string | null> {
  try {
    if (!isSafeFileName(name)) return null;
    const file = new File(folder(), name);
    return file.exists ? await file.base64() : null;
  } catch {
    return null;
  }
}

export async function writePhotoBase64(name: string, data: string): Promise<boolean> {
  try {
    if (!isSafeFileName(name)) return false;
    const file = new File(folder(), name);
    if (file.exists) file.delete();
    file.create();
    await file.write(data, { encoding: 'base64' });
    return true;
  } catch {
    return false;
  }
}
