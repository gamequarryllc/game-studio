import { isSafeId, newId } from './ids';
import {
  CATEGORIES,
  DOC_VERSION,
  LIMITS,
  ROOM_ICONS,
  type Category,
  type Doc,
  type Item,
  type Photo,
  type Room,
  type RoomIcon,
} from './types';
import { isValidYmd } from './dates';

export class DocError extends Error {
  constructor(
    message: string,
    readonly reason: 'not-a-document' | 'too-new',
  ) {
    super(message);
    this.name = 'DocError';
  }
}

export const DEFAULT_CURRENCY = 'USD';

export function emptyDoc(now: number, currency: string = DEFAULT_CURRENCY): Doc {
  return {
    version: DOC_VERSION,
    rooms: [],
    items: [],
    profile: { homeName: '', ownerName: '', address: '', insurer: '', policyNumber: '' },
    settings: { currency },
    meta: { createdAt: now, onboarded: false, lastBackupAt: null, lastReportAt: null },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Trims, drops control characters and cuts to length. Never throws. */
export function cleanText(v: unknown, max: number, multiline = false): string {
  if (typeof v !== 'string') return '';
  const stripped = multiline ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '') : v.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return stripped.trim().slice(0, max);
}

function cleanTime(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function cleanTimeOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

export function cleanCents(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.min(Math.round(v), LIMITS.cents);
}

export function cleanQuantity(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.min(Math.max(Math.round(v), 1), LIMITS.quantity);
}

function cleanPhotos(v: unknown, max: number, seen: Set<string>): Photo[] {
  if (!Array.isArray(v)) return [];
  const out: Photo[] = [];
  for (const p of v) {
    if (!isRecord(p) || !isSafeId(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    const width = typeof p.width === 'number' && p.width > 0 ? Math.round(p.width) : 0;
    const height = typeof p.height === 'number' && p.height > 0 ? Math.round(p.height) : 0;
    out.push({ id: p.id, width, height });
    if (out.length >= max) break;
  }
  return out;
}

const CURRENCY_RX = /^[A-Z]{3}$/;

/**
 * Turns anything (a saved file, a backup someone picked) into a valid Doc.
 * Unknown fields are dropped, bad values are repaired, and an item whose room
 * has gone is put in a room called "Unsorted" rather than lost.
 */
export function parseDoc(raw: unknown, now: number): Doc {
  if (!isRecord(raw) || !Array.isArray(raw.rooms) || !Array.isArray(raw.items)) {
    throw new DocError('This is not a Roomfile document.', 'not-a-document');
  }
  if (typeof raw.version === 'number' && raw.version > DOC_VERSION) {
    throw new DocError('This was made by a newer version of Roomfile.', 'too-new');
  }

  const rooms: Room[] = [];
  const roomIds = new Set<string>();
  for (const r of raw.rooms) {
    if (!isRecord(r) || !isSafeId(r.id) || roomIds.has(r.id)) continue;
    const name = cleanText(r.name, LIMITS.name);
    if (!name) continue;
    const icon: RoomIcon = (ROOM_ICONS as readonly string[]).includes(r.icon as string) ? (r.icon as RoomIcon) : 'box';
    rooms.push({ id: r.id, name, icon, createdAt: cleanTime(r.createdAt, now) });
    roomIds.add(r.id);
    if (rooms.length >= LIMITS.rooms) break;
  }

  const items: Item[] = [];
  const itemIds = new Set<string>();
  const photoIds = new Set<string>();
  let unsortedId: string | null = null;
  for (const it of raw.items) {
    if (!isRecord(it) || !isSafeId(it.id) || itemIds.has(it.id)) continue;
    const name = cleanText(it.name, LIMITS.name);
    if (!name) continue;
    let roomId = typeof it.roomId === 'string' && roomIds.has(it.roomId) ? it.roomId : null;
    if (!roomId) {
      if (!unsortedId) {
        const existing = rooms.find((r) => r.name.toLowerCase() === 'unsorted');
        if (existing) {
          unsortedId = existing.id;
        } else {
          unsortedId = newId();
          rooms.push({ id: unsortedId, name: 'Unsorted', icon: 'box', createdAt: now });
          roomIds.add(unsortedId);
        }
      }
      roomId = unsortedId;
    }
    const category: Category | null = (CATEGORIES as readonly string[]).includes(it.category as string)
      ? (it.category as Category)
      : null;
    const createdAt = cleanTime(it.createdAt, now);
    items.push({
      id: it.id,
      roomId,
      name,
      category,
      quantity: cleanQuantity(it.quantity),
      valueCents: cleanCents(it.valueCents),
      pricePaidCents: cleanCents(it.pricePaidCents),
      purchaseDate: typeof it.purchaseDate === 'string' && isValidYmd(it.purchaseDate) ? it.purchaseDate : null,
      purchasedFrom: cleanText(it.purchasedFrom, LIMITS.short),
      brand: cleanText(it.brand, LIMITS.short),
      model: cleanText(it.model, LIMITS.short),
      serial: cleanText(it.serial, LIMITS.short),
      notes: cleanText(it.notes, LIMITS.notes, true),
      photos: cleanPhotos(it.photos, LIMITS.photosPerItem, photoIds),
      receipts: cleanPhotos(it.receipts, LIMITS.receiptsPerItem, photoIds),
      createdAt,
      updatedAt: cleanTime(it.updatedAt, createdAt),
    });
    itemIds.add(it.id);
  }

  const profile = isRecord(raw.profile) ? raw.profile : {};
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const currency =
    typeof settings.currency === 'string' && CURRENCY_RX.test(settings.currency) ? settings.currency : DEFAULT_CURRENCY;

  return {
    version: DOC_VERSION,
    rooms,
    items,
    profile: {
      homeName: cleanText(profile.homeName, LIMITS.short),
      ownerName: cleanText(profile.ownerName, LIMITS.short),
      address: cleanText(profile.address, LIMITS.address, true),
      insurer: cleanText(profile.insurer, LIMITS.short),
      policyNumber: cleanText(profile.policyNumber, LIMITS.short),
    },
    settings: { currency },
    meta: {
      createdAt: cleanTime(meta.createdAt, now),
      // A document with rooms in it has clearly been set up, whatever the flag says.
      onboarded: meta.onboarded === true || rooms.length > 0,
      lastBackupAt: cleanTimeOrNull(meta.lastBackupAt),
      lastReportAt: cleanTimeOrNull(meta.lastReportAt),
    },
  };
}

export function parseDocText(text: string, now: number): Doc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocError('This file could not be read.', 'not-a-document');
  }
  return parseDoc(raw, now);
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc);
}

/** Every photo file the document still points at. */
export function photoIdsInUse(doc: Doc): Set<string> {
  const ids = new Set<string>();
  for (const item of doc.items) {
    for (const p of item.photos) ids.add(p.id);
    for (const p of item.receipts) ids.add(p.id);
  }
  return ids;
}
