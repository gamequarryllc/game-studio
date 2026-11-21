import * as ImagePicker from 'expo-image-picker';

import { isSafeFileName } from '@/domain/doc';
import { newId } from '@/domain/ids';
import type { Photo } from '@/domain/types';

import { dbDelete, dbGet, dbKeys, dbPut } from './webdb';

// The web preview's version of photos.ts: pictures are kept in the browser's
// IndexedDB as data URLs, scaled down the same way.

const LONG_SIDE = 1600;

export const CAN_TAKE_PHOTO = false;

export type PickResult = { photos: Photo[]; failed: number; denied?: boolean };

function load(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Not a picture'));
    img.src = uri;
  });
}

async function keep(uri: string): Promise<Photo | null> {
  try {
    const img = await load(uri);
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const id = newId();
    const name = `${id}.jpg`;
    await dbPut('photos', name, canvas.toDataURL('image/jpeg', 0.82));
    return { id, kind: 'file', file: name, w, h };
  } catch {
    return null;
  }
}

export async function pickFromLibrary(max: number): Promise<PickResult> {
  if (max <= 0) return { photos: [], failed: 0 };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: max > 1, quality: 1 });
  if (result.canceled) return { photos: [], failed: 0 };
  const photos: Photo[] = [];
  let failed = 0;
  for (const asset of result.assets.slice(0, max)) {
    const photo = await keep(asset.uri);
    if (photo) photos.push(photo);
    else failed += 1;
  }
  return { photos, failed };
}

export async function takePhoto(): Promise<PickResult> {
  return { photos: [], failed: 0 };
}

const cache = new Map<string, string>();

export async function photoUri(name: string): Promise<string | null> {
  if (!isSafeFileName(name)) return null;
  const hit = cache.get(name);
  if (hit) return hit;
  const data = (await dbGet<string>('photos', name)) ?? null;
  if (data) cache.set(name, data);
  return data;
}

export async function deletePhotoFiles(names: string[]): Promise<void> {
  for (const name of names) {
    cache.delete(name);
    await dbDelete('photos', name).catch(() => {});
  }
}

export async function sweepPhotos(keepNames: string[]): Promise<void> {
  try {
    const wanted = new Set(keepNames);
    for (const name of await dbKeys('photos')) if (!wanted.has(name)) await dbDelete('photos', name);
  } catch {
    // Not worth stopping the preview for.
  }
}

export async function readPhotoBase64(name: string): Promise<string | null> {
  const data = await photoUri(name);
  return data ? data.slice(data.indexOf(',') + 1) : null;
}

export async function writePhotoBase64(name: string, data: string): Promise<boolean> {
  if (!isSafeFileName(name)) return false;
  cache.delete(name);
  await dbPut('photos', name, `data:image/${name.endsWith('.png') ? 'png' : 'jpeg'};base64,${data}`);
  return true;
}
