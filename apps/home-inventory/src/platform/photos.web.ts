import { useEffect, useState } from 'react';

import { parsePhotoEntryName, type PhotoSize } from '@/domain/backup';
import { newId } from '@/domain/ids';
import type { Photo } from '@/domain/types';

import { dbDelete, dbGet, dbKeys, dbPut } from './webdb';

// The web preview's version of photos.ts. Photos are scaled on a canvas and
// kept as JPEG data in IndexedDB.

export const FULL_SIDE = 1600;
export const THUMB_SIDE = 480;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

const key = (id: string, size: PhotoSize) => (size === 'thumb' ? `${id}_t` : id);
const cache = new Map<string, string>();

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = uri;
  });
}

function scale(img: HTMLImageElement, side: number, quality: number): { uri: string; width: number; height: number } {
  const ratio = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That image could not be read.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { uri: canvas.toDataURL('image/jpeg', quality), width, height };
}

export async function importPhoto(source: PickedImage): Promise<Photo> {
  const img = await loadImage(source.uri);
  const id = newId();
  const full = scale(img, FULL_SIDE, 0.82);
  const thumb = scale(img, THUMB_SIDE, 0.7);
  await dbPut('photos', key(id, 'full'), full.uri);
  await dbPut('photos', key(id, 'thumb'), thumb.uri);
  cache.set(key(id, 'full'), full.uri);
  cache.set(key(id, 'thumb'), thumb.uri);
  return { id, width: full.width, height: full.height };
}

async function load(id: string, size: PhotoSize): Promise<string | null> {
  const k = key(id, size);
  const hit = cache.get(k);
  if (hit) return hit;
  const uri = (await dbGet<string>('photos', k)) ?? null;
  if (uri) cache.set(k, uri);
  return uri;
}

export function usePhotoUri(id: string | null | undefined, size: PhotoSize): string | null {
  const k = id ? key(id, size) : null;
  const [loaded, setLoaded] = useState<{ k: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!id || !k || cache.has(k)) return;
    let live = true;
    load(id, size).then(
      (uri) => live && setLoaded({ k, uri }),
      () => live && setLoaded({ k, uri: null }),
    );
    return () => {
      live = false;
    };
  }, [id, k, size]);
  if (!k) return null;
  return cache.get(k) ?? (loaded?.k === k ? loaded.uri : null);
}

function dataUriToBytes(uri: string): Uint8Array {
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToDataUri(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function readPhotoBase64(id: string, size: PhotoSize): Promise<string | null> {
  const uri = await load(id, size);
  return uri ? uri.slice(uri.indexOf(',') + 1) : null;
}

export async function readPhotoBytes(id: string, size: PhotoSize): Promise<Uint8Array | null> {
  const uri = await load(id, size);
  return uri ? dataUriToBytes(uri) : null;
}

export async function deletePhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    for (const size of ['full', 'thumb'] as const) {
      cache.delete(key(id, size));
      await dbDelete('photos', key(id, size));
    }
  }
}

export async function removeOrphanPhotos(inUse: Set<string>): Promise<number> {
  const gone = new Set<string>();
  for (const k of await dbKeys('photos')) {
    const parsed = parsePhotoEntryName(`photos/${k}.jpg`);
    if (parsed && !inUse.has(parsed.id)) {
      cache.delete(k);
      await dbDelete('photos', k);
      gone.add(parsed.id);
    }
  }
  return gone.size;
}

export interface PhotoRestore {
  write(id: string, size: PhotoSize, data: Uint8Array): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

export function beginPhotoRestore(): PhotoRestore {
  const staged = new Map<string, string>();
  return {
    async write(id, size, data) {
      staged.set(key(id, size), bytesToDataUri(data));
    },
    async commit() {
      for (const [k, uri] of staged) {
        await dbPut('photos', k, uri);
        cache.set(k, uri);
      }
      staged.clear();
    },
    async abort() {
      staged.clear();
    },
  };
}
