import { useEffect, useState } from 'react';

import { isAttachmentName } from '@/domain/backup';

import type { PickedImage } from './photos';
import { dbDelete, dbGet, dbKeys, dbPut } from './webdb';

// The web preview's version of attachments.ts: each file is a Blob in IndexedDB.

export const PAGE_SIDE = 2400;
const READ_SIZE = 1024 * 1024;

const urls = new Map<string, string>();

function mimeOf(name: string): string {
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

async function blobOf(name: string): Promise<Blob | null> {
  return (await dbGet<Blob>('files', name)) ?? null;
}

async function urlOf(name: string): Promise<string | null> {
  const hit = urls.get(name);
  if (hit) return hit;
  const blob = await blobOf(name);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(name, url);
  return url;
}

export function useAttachmentUri(name: string | null): string | null {
  const [loaded, setLoaded] = useState<{ name: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!name || urls.has(name)) return;
    let live = true;
    urlOf(name).then(
      (url) => live && setLoaded({ name, url }),
      () => live && setLoaded({ name, url: null }),
    );
    return () => {
      live = false;
    };
  }, [name]);
  if (!name) return null;
  return urls.get(name) ?? (loaded?.name === name ? loaded.url : null);
}

export async function importFile(sourceUri: string, name: string): Promise<number> {
  const response = await fetch(sourceUri);
  const blob = await response.blob();
  const typed = blob.type ? blob : new Blob([blob], { type: mimeOf(name) });
  await dbPut('files', name, typed);
  return typed.size;
}

export async function importPageImage(source: PickedImage, name: string): Promise<number> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That image could not be read.'));
    el.src = source.uri;
  });
  const ratio = Math.min(1, PAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That image could not be read.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That image could not be read.'))), 'image/jpeg', 0.85));
  await dbPut('files', name, blob);
  return blob.size;
}

export async function attachmentExists(name: string): Promise<boolean> {
  return (await blobOf(name)) !== null;
}

function forget(name: string) {
  const url = urls.get(name);
  if (url) URL.revokeObjectURL(url);
  urls.delete(name);
}

export async function deleteAttachments(names: string[]): Promise<void> {
  for (const name of names) {
    forget(name);
    await dbDelete('files', name);
  }
}

export async function removeOrphanAttachments(inUse: Set<string>): Promise<number> {
  let gone = 0;
  for (const name of await dbKeys('files')) {
    if (isAttachmentName(name) && !inUse.has(name)) {
      forget(name);
      await dbDelete('files', name);
      gone += 1;
    }
  }
  return gone;
}

export async function readAttachment(name: string, onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void): Promise<boolean> {
  const blob = await blobOf(name);
  if (!blob) return false;
  if (blob.size === 0) {
    await onChunk(new Uint8Array(0), true);
    return true;
  }
  for (let at = 0; at < blob.size; at += READ_SIZE) {
    const end = Math.min(blob.size, at + READ_SIZE);
    await onChunk(new Uint8Array(await blob.slice(at, end).arrayBuffer()), end >= blob.size);
  }
  return true;
}

export async function previewAttachment(name: string, _title: string): Promise<void> {
  const url = await urlOf(name);
  if (!url) throw new Error('missing');
  window.open(url, '_blank', 'noopener');
}

export async function shareAttachment(name: string, _mimeType: string, _uti: string): Promise<void> {
  const url = await urlOf(name);
  if (!url) throw new Error('missing');
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export interface AttachmentRestore {
  open(name: string): (chunk: Uint8Array, final: boolean) => Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

export function beginAttachmentRestore(): AttachmentRestore {
  const staged = new Map<string, Uint8Array[]>();
  return {
    open(name) {
      const parts: Uint8Array[] = [];
      staged.set(name, parts);
      return async (chunk) => {
        if (chunk.length > 0) parts.push(chunk.slice());
      };
    },
    async commit() {
      for (const [name, parts] of staged) {
        forget(name);
        await dbPut('files', name, new Blob(parts as BlobPart[], { type: mimeOf(name) }));
      }
      staged.clear();
    },
    async abort() {
      staged.clear();
    },
  };
}
