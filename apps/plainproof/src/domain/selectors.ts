import { SERIAL_CATEGORIES, type Doc, type Id, type Item, type Room } from './types';

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
  return s;
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

/** "Sony · WH-1000XM5" style line under an item's name. */
export function itemSubtitle(item: Item): string {
  const parts = [item.brand, item.model].filter(Boolean);
  if (item.quantity > 1) parts.push(`${item.quantity} of them`);
  return parts.join(' · ');
}
