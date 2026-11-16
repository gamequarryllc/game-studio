import { isSafeId, newId } from './ids';
import {
  CATEGORIES,
  CONDITIONS,
  LOSS_CAUSES,
  LOSS_STATUSES,
  DOC_VERSION,
  LIMITS,
  ROOM_ICONS,
  type Category,
  type Condition,
  type Attachment,
  type Claim,
  type ClaimItem,
  type LossCause,
  type LossStatus,
  type Policy,
  type Settings,
  type Video,
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
    settings: defaultSettings(currency),
    meta: { createdAt: now, onboarded: false, lastBackupAt: null, lastReportAt: null, modifiedAt: null },
    claims: [],
    policy: emptyPolicy(),
  };
}

export function defaultSettings(currency: string = DEFAULT_CURRENCY): Settings {
  return { currency, reminders: { yearly: false, backup: false, warranty: false }, icloudBackup: false };
}

export function emptyPolicy(): Policy {
  return { contentsLimitCents: null, deductibleCents: null, categoryLimits: {}, documents: [] };
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
    out.push({ id: p.id, width, height, takenAt: cleanTimeOrNull(p.takenAt), addedAt: cleanTimeOrNull(p.addedAt) });
    if (out.length >= max) break;
  }
  return out;
}

function cleanVideos(v: unknown, seen: Set<string>): Video[] {
  if (!Array.isArray(v)) return [];
  const out: Video[] = [];
  for (const x of v) {
    if (!isRecord(x) || !isSafeId(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({
      id: x.id,
      durationMs: cleanTimeOrNull(x.durationMs),
      bytes: typeof x.bytes === 'number' && x.bytes > 0 ? Math.round(x.bytes) : 0,
      takenAt: cleanTimeOrNull(x.takenAt),
      addedAt: cleanTime(x.addedAt, 1),
      ext: x.ext === 'mp4' ? 'mp4' : 'mov',
    });
    if (out.length >= LIMITS.videosPerRoom) break;
  }
  return out;
}

export function cleanAttachments(v: unknown, seen: Set<string>, max: number): Attachment[] {
  if (!Array.isArray(v)) return [];
  const out: Attachment[] = [];
  for (const x of v) {
    if (!isRecord(x) || !isSafeId(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({
      id: x.id,
      name: cleanText(x.name, LIMITS.short) || 'Document',
      kind: x.kind === 'pdf' ? 'pdf' : 'image',
      bytes: typeof x.bytes === 'number' && x.bytes > 0 ? Math.round(x.bytes) : 0,
      addedAt: cleanTime(x.addedAt, 1),
    });
    if (out.length >= max) break;
  }
  return out;
}

function isLoss(v: unknown): v is LossStatus {
  return (LOSS_STATUSES as readonly unknown[]).includes(v);
}

function cleanClaimItems(v: unknown, itemIds: Set<string>): ClaimItem[] {
  const out: ClaimItem[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(v) ? v : []) {
    // An entry for an item that has gone, or a second entry for the same item, is dropped.
    if (!isRecord(x) || typeof x.itemId !== 'string' || !itemIds.has(x.itemId) || seen.has(x.itemId) || !isLoss(x.loss)) continue;
    seen.add(x.itemId);
    out.push({ itemId: x.itemId, loss: x.loss, note: cleanText(x.note, LIMITS.notes, true) });
  }
  return out;
}

function cleanClaim(v: Record<string, unknown>, id: string, items: ClaimItem[], now: number): Claim {
  return {
    id,
    name: cleanText(v.name, LIMITS.short),
    openedAt: cleanTime(v.openedAt, now),
    lossDate: typeof v.lossDate === 'string' && isValidYmd(v.lossDate) ? v.lossDate : null,
    cause: (LOSS_CAUSES as readonly unknown[]).includes(v.cause) ? (v.cause as LossCause) : null,
    claimNumber: cleanText(v.claimNumber, LIMITS.short),
    description: cleanText(v.description, LIMITS.notes, true),
    items,
  };
}

/**
 * The place's claims. Builds before several claims (1.0.1 build 64) kept one
 * claim as `claim`, with each claimed item carrying its own status and note;
 * that comes back as a single claim.
 */
function cleanClaims(raw: Record<string, unknown>, itemIds: Set<string>, legacy: ClaimItem[], now: number): Claim[] {
  const out: Claim[] = [];
  if (Array.isArray(raw.claims)) {
    const ids = new Set<string>();
    for (const c of raw.claims) {
      if (!isRecord(c)) continue;
      const id = isSafeId(c.id) && !ids.has(c.id) ? c.id : newId();
      ids.add(id);
      out.push(cleanClaim(c, id, cleanClaimItems(c.items, itemIds), now));
      // A file may hold more than the app lets one open; they are all kept, up to a sane bound.
      if (out.length >= LIMITS.claims * 4) break;
    }
    return out;
  }
  if (isRecord(raw.claim) || legacy.length > 0) out.push(cleanClaim(isRecord(raw.claim) ? raw.claim : {}, newId(), legacy, now));
  return out;
}

function cleanPolicy(v: unknown, seen: Set<string>): Policy {
  const p = isRecord(v) ? v : {};
  const limits: Partial<Record<Category, number>> = {};
  if (isRecord(p.categoryLimits)) {
    for (const k of CATEGORIES) {
      const c = cleanCents(p.categoryLimits[k]);
      if (c !== null) limits[k] = c;
    }
  }
  return {
    contentsLimitCents: cleanCents(p.contentsLimitCents),
    deductibleCents: cleanCents(p.deductibleCents),
    categoryLimits: limits,
    documents: cleanAttachments(p.documents, seen, LIMITS.policyDocuments),
  };
}

function cleanSettings(v: Record<string, unknown>): Settings {
  const currency = typeof v.currency === 'string' && CURRENCY_RX.test(v.currency) ? v.currency : DEFAULT_CURRENCY;
  const r = isRecord(v.reminders) ? v.reminders : {};
  return {
    currency,
    reminders: { yearly: r.yearly === true, backup: r.backup === true, warranty: r.warranty === true },
    icloudBackup: v.icloudBackup === true,
  };
}

const CURRENCY_RX = /^[A-Z]{3}$/;

/**
 * Turns anything (a saved file, a backup someone picked) into a valid Doc.
 * Unknown fields are dropped, bad values are repaired, and an item whose room
 * has gone is put in a room called "Unsorted" rather than lost.
 */
export function parseDoc(raw: unknown, now: number): Doc {
  if (!isRecord(raw) || !Array.isArray(raw.rooms) || !Array.isArray(raw.items)) {
    throw new DocError('This is not a Plainproof document.', 'not-a-document');
  }
  if (typeof raw.version === 'number' && raw.version > DOC_VERSION) {
    throw new DocError('This was made by a newer version of Plainproof.', 'too-new');
  }

  const rooms: Room[] = [];
  const roomIds = new Set<string>();
  // Photos, videos and documents all live as files named by id, so an id may be used only once across all of them.
  const fileIds = new Set<string>();
  for (const r of raw.rooms) {
    if (!isRecord(r) || !isSafeId(r.id) || roomIds.has(r.id)) continue;
    const name = cleanText(r.name, LIMITS.name);
    if (!name) continue;
    const icon: RoomIcon = (ROOM_ICONS as readonly string[]).includes(r.icon as string) ? (r.icon as RoomIcon) : 'box';
    rooms.push({ id: r.id, name, icon, createdAt: cleanTime(r.createdAt, now), videos: cleanVideos(r.videos, fileIds) });
    roomIds.add(r.id);
    if (rooms.length >= LIMITS.roomsOnLoad) break;
  }

  const items: Item[] = [];
  const itemIds = new Set<string>();
  const legacyClaimItems: ClaimItem[] = [];
  const photoIds = fileIds;
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
          rooms.push({ id: unsortedId, name: 'Unsorted', icon: 'box', createdAt: now, videos: [] });
          roomIds.add(unsortedId);
        }
      }
      roomId = unsortedId;
    }
    const category: Category | null = (CATEGORIES as readonly string[]).includes(it.category as string)
      ? (it.category as Category)
      : null;
    const condition: Condition | null = (CONDITIONS as readonly string[]).includes(it.condition as string)
      ? (it.condition as Condition)
      : null;
    const createdAt = cleanTime(it.createdAt, now);
    items.push({
      id: it.id,
      roomId,
      name,
      category,
      condition,
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
      warrantyUntil: typeof it.warrantyUntil === 'string' && isValidYmd(it.warrantyUntil) ? it.warrantyUntil : null,
    });
    itemIds.add(it.id);
    if (isLoss(it.loss)) legacyClaimItems.push({ itemId: it.id, loss: it.loss, note: cleanText(it.lossNote, LIMITS.notes, true) });
  }

  const profile = isRecord(raw.profile) ? raw.profile : {};
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const meta = isRecord(raw.meta) ? raw.meta : {};

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
    settings: cleanSettings(settings),
    meta: {
      createdAt: cleanTime(meta.createdAt, now),
      // A document with rooms in it has clearly been set up, whatever the flag says.
      onboarded: meta.onboarded === true || rooms.length > 0,
      lastBackupAt: cleanTimeOrNull(meta.lastBackupAt),
      lastReportAt: cleanTimeOrNull(meta.lastReportAt),
      modifiedAt: cleanTimeOrNull(meta.modifiedAt),
    },
    claims: cleanClaims(raw, itemIds, legacyClaimItems, now),
    policy: cleanPolicy(raw.policy, fileIds),
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

/** Every video and document file the document still points at, by id, with the file's name on disk. */
export function filesInUse(doc: Doc): Map<string, string> {
  const files = new Map<string, string>();
  for (const room of doc.rooms) for (const v of room.videos) files.set(v.id, `${v.id}.${v.ext}`);
  for (const a of doc.policy.documents) files.set(a.id, `${a.id}.${a.kind === 'pdf' ? 'pdf' : 'jpg'}`);
  return files;
}
