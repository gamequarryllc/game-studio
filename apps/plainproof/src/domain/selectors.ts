import { LOSS_LABELS, LOSS_STATUSES, SERIAL_CATEGORIES, type Doc, type Id, type Item, type LossStatus, type Room } from './types';

/** What one of this item is worth: its stated value, else what was paid. */
export function unitCents(item: Item): number | null {
  return item.valueCents ?? item.pricePaidCents;
}

export function itemTotalCents(item: Item): number {
  return (unitCents(item) ?? 0) * item.quantity;
}

export function hasValue(item: Item): boolean {
  return unitCents(item) !== null;
}

export function needsSerial(item: Item): boolean {
  return item.serial === '' && item.category !== null && SERIAL_CATEGORIES.includes(item.category);
}

export interface RoomSummary {
  room: Room;
  /** Records in the room. */
  count: number;
  /** Individual things, counting quantities. */
  pieces: number;
  /** Records with a value or a price paid. */
  valued: number;
  totalCents: number;
}

export function roomSummaries(doc: Doc): RoomSummary[] {
  const byRoom = new Map<Id, RoomSummary>();
  for (const room of doc.rooms) byRoom.set(room.id, { room, count: 0, pieces: 0, valued: 0, totalCents: 0 });
  for (const item of doc.items) {
    const s = byRoom.get(item.roomId);
    if (!s) continue;
    s.count += 1;
    s.pieces += item.quantity;
    if (hasValue(item)) s.valued += 1;
    s.totalCents += itemTotalCents(item);
  }
  return doc.rooms.map((r) => byRoom.get(r.id)!);
}

export interface HomeSummary {
  count: number;
  pieces: number;
  rooms: number;
  /** Rooms with at least one item in them: the count the report gives. */
  filledRooms: number;
  totalCents: number;
  withPhoto: number;
  withValue: number;
  withSerial: number;
  withReceipt: number;
  missingSerial: number;
}

export function homeSummary(doc: Doc): HomeSummary {
  const s: HomeSummary = {
    count: doc.items.length,
    pieces: 0,
    rooms: doc.rooms.length,
    filledRooms: 0,
    totalCents: 0,
    withPhoto: 0,
    withValue: 0,
    withSerial: 0,
    withReceipt: 0,
    missingSerial: 0,
  };
  for (const item of doc.items) {
    s.pieces += item.quantity;
    s.totalCents += itemTotalCents(item);
    if (item.photos.length > 0) s.withPhoto += 1;
    if (hasValue(item)) s.withValue += 1;
    if (item.serial !== '') s.withSerial += 1;
    if (item.receipts.length > 0) s.withReceipt += 1;
    if (needsSerial(item)) s.missingSerial += 1;
  }
  const roomIds = new Set(doc.rooms.map((r) => r.id));
  s.filledRooms = new Set(doc.items.map((i) => i.roomId).filter((id) => roomIds.has(id))).size;
  return s;
}

/**
 * Where the copy kept off the phone stands. 'never': there are things here and no backup has been made.
 * 'behind': something was added or changed since the last one. 'none': nothing to back up yet.
 */
export type BackupState = 'none' | 'never' | 'behind' | 'current';

export function backupState(doc: Doc): BackupState {
  if (doc.items.length === 0) return 'none';
  const at = doc.meta.lastBackupAt;
  if (at === null) return 'never';
  // Anything changed since (an item deleted, a room renamed, the policy number) counts, not only edited items.
  const modified = doc.meta.modifiedAt ?? 0;
  return modified > at || doc.items.some((item) => item.updatedAt > at) ? 'behind' : 'current';
}

export type ItemFilter = 'all' | 'no-photo' | 'no-value' | 'no-serial';
export type ItemSort = 'recent' | 'value' | 'name';

export function matchesFilter(item: Item, filter: ItemFilter): boolean {
  switch (filter) {
    case 'no-photo':
      return item.photos.length === 0;
    case 'no-value':
      return !hasValue(item);
    case 'no-serial':
      return needsSerial(item);
    default:
      return true;
  }
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every word typed must appear somewhere in the item (name, brand, model, serial, notes, shop or room). */
export function matchesQuery(item: Item, roomName: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(
    [item.name, item.brand, item.model, item.serial, item.notes, item.purchasedFrom, roomName].join('\n'),
  );
  return words.every((w) => hay.includes(w));
}

export function sortItems(items: Item[], sort: ItemSort): Item[] {
  const out = [...items];
  switch (sort) {
    case 'value':
      out.sort((a, b) => itemTotalCents(b) - itemTotalCents(a) || a.name.localeCompare(b.name));
      break;
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.createdAt - b.createdAt);
      break;
    default:
      out.sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
  }
  return out;
}

export function findItems(
  doc: Doc,
  opts: { query?: string; filter?: ItemFilter; sort?: ItemSort; roomId?: Id },
): Item[] {
  const roomNames = new Map(doc.rooms.map((r) => [r.id, r.name]));
  const filtered = doc.items.filter(
    (it) =>
      (!opts.roomId || it.roomId === opts.roomId) &&
      matchesFilter(it, opts.filter ?? 'all') &&
      matchesQuery(it, roomNames.get(it.roomId) ?? '', opts.query ?? ''),
  );
  return sortItems(filtered, opts.sort ?? 'recent');
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** "7 photos, 1 video and 2 documents": the parts that are there, joined as a sentence would. */
export function listJoin(parts: string[]): string {
  const kept = parts.filter(Boolean);
  if (kept.length <= 1) return kept.join('');
  return `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`;
}

/** "Sony · WH-1000XM5" style line under an item's name. */
export function itemSubtitle(item: Item): string {
  const parts = [item.brand, item.model].filter(Boolean);
  if (item.quantity > 1) parts.push(`${item.quantity} of them`);
  return parts.join(' · ');
}

export interface ClaimSummary {
  count: number;
  /** What the claimed items are worth (replacement value, else price paid). */
  totalCents: number;
  /** Claimed items with no value at all: the adjuster will ask. */
  unvalued: number;
  byStatus: Record<LossStatus, number>;
}

export function claimSummary(doc: Doc): ClaimSummary {
  const byStatus: Record<LossStatus, number> = { stolen: 0, damaged: 0, destroyed: 0, lost: 0 };
  let count = 0;
  let totalCents = 0;
  let unvalued = 0;
  for (const item of doc.items) {
    if (!item.loss) continue;
    count += 1;
    byStatus[item.loss] += 1;
    if (hasValue(item)) totalCents += itemTotalCents(item);
    else unvalued += 1;
  }
  return { count, totalCents, unvalued, byStatus };
}

/** "2 stolen · 1 damaged", in the order the statuses are listed. */
export function lossCountLine(byStatus: Record<LossStatus, number>): string {
  return LOSS_STATUSES.filter((k) => byStatus[k] > 0)
    .map((k) => `${byStatus[k]} ${LOSS_LABELS[k].toLowerCase()}`)
    .join(' · ');
}

/** A file size the way Files shows it: 820 KB, 14.2 MB, 1.3 GB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** A video's length: 0:42, 3:05, 1:02:10. */
export function formatDuration(ms: number | null): string {
  // Zero means the length was not known, not a video with nothing in it.
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
