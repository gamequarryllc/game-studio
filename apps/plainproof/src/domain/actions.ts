import { cleanCents, cleanQuantity, cleanText } from './doc';
import { isValidYmd } from './dates';
import { newId } from './ids';
import { CATEGORIES, LIMITS, ROOM_ICONS, type Category, type Doc, type Id, type Item, type Photo, type Profile, type Room, type RoomIcon } from './types';

// Every change to the document is a plain function: (doc, input, now) -> new doc.
// Nothing here touches files, the clock or the screen, so all of it is unit tested.

export interface RoomSeed {
  name: string;
  icon: RoomIcon;
}

export const SUGGESTED_ROOMS: readonly RoomSeed[] = [
  { name: 'Living room', icon: 'sofa' },
  { name: 'Kitchen', icon: 'kitchen' },
  { name: 'Bedroom', icon: 'bed' },
  { name: 'Bathroom', icon: 'bath' },
  { name: 'Home office', icon: 'desk' },
  { name: 'Dining room', icon: 'dining' },
  { name: 'Kids’ room', icon: 'kids' },
  { name: 'Laundry', icon: 'laundry' },
  { name: 'Garage', icon: 'garage' },
  { name: 'Basement', icon: 'storage' },
  { name: 'Attic', icon: 'storage' },
  { name: 'Yard and shed', icon: 'outdoor' },
];

/** A fair guess at an icon from what the room is called. */
export function iconForRoomName(name: string): RoomIcon {
  const n = name.toLowerCase();
  const table: [RegExp, RoomIcon][] = [
    [/living|lounge|family|den|tv|sitting/, 'sofa'],
    [/bed|guest|nursery|master|primary/, 'bed'],
    [/kitchen|pantry/, 'kitchen'],
    [/dining/, 'dining'],
    [/bath|toilet|powder|ensuite/, 'bath'],
    [/office|study|desk|studio/, 'desk'],
    [/kid|child|play|toy/, 'kids'],
    [/laundry|utility|mud/, 'laundry'],
    [/garage|car|workshop/, 'garage'],
    [/basement|attic|loft|storage|cellar|closet|cupboard/, 'storage'],
    [/yard|garden|shed|patio|deck|porch|balcony|outdoor/, 'outdoor'],
    [/hall|entry|foyer|stairs|landing/, 'hall'],
  ];
  for (const [rx, icon] of table) if (rx.test(n)) return icon;
  return 'box';
}

function uniqueRoomName(rooms: Room[], wanted: string, ignoreId?: Id): string {
  const taken = new Set(rooms.filter((r) => r.id !== ignoreId).map((r) => r.name.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${wanted.slice(0, LIMITS.name - 5)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return wanted;
}

export function addRooms(doc: Doc, seeds: readonly RoomSeed[], now: number): Doc {
  const rooms = [...doc.rooms];
  for (const seed of seeds) {
    if (rooms.length >= LIMITS.rooms) break;
    const name = cleanText(seed.name, LIMITS.name);
    if (!name) continue;
    const icon = (ROOM_ICONS as readonly string[]).includes(seed.icon) ? seed.icon : 'box';
    rooms.push({ id: newId(), name: uniqueRoomName(rooms, name), icon, createdAt: now });
  }
  return { ...doc, rooms };
}

export function addRoom(doc: Doc, name: string, now: number): { doc: Doc; roomId: Id | null } {
  const clean = cleanText(name, LIMITS.name);
  if (!clean || doc.rooms.length >= LIMITS.rooms) return { doc, roomId: null };
  const next = addRooms(doc, [{ name: clean, icon: iconForRoomName(clean) }], now);
  return { doc: next, roomId: next.rooms[next.rooms.length - 1].id };
}

export function renameRoom(doc: Doc, roomId: Id, name: string): Doc {
  const clean = cleanText(name, LIMITS.name);
  if (!clean) return doc;
  return {
    ...doc,
    rooms: doc.rooms.map((r) => (r.id === roomId ? { ...r, name: uniqueRoomName(doc.rooms, clean, roomId) } : r)),
  };
}

export function setRoomIcon(doc: Doc, roomId: Id, icon: RoomIcon): Doc {
  if (!(ROOM_ICONS as readonly string[]).includes(icon)) return doc;
  return { ...doc, rooms: doc.rooms.map((r) => (r.id === roomId ? { ...r, icon } : r)) };
}

export function moveRoom(doc: Doc, roomId: Id, by: -1 | 1): Doc {
  const from = doc.rooms.findIndex((r) => r.id === roomId);
  const to = from + by;
  if (from < 0 || to < 0 || to >= doc.rooms.length) return doc;
  const rooms = [...doc.rooms];
  [rooms[from], rooms[to]] = [rooms[to], rooms[from]];
  return { ...doc, rooms };
}

/**
 * Removes a room. Its items move to `moveItemsTo` when that room exists;
 * otherwise they are deleted with it.
 */
export function deleteRoom(doc: Doc, roomId: Id, moveItemsTo: Id | null, now: number): Doc {
  if (!doc.rooms.some((r) => r.id === roomId)) return doc;
  const target = moveItemsTo && moveItemsTo !== roomId && doc.rooms.some((r) => r.id === moveItemsTo) ? moveItemsTo : null;
  const items = target
    ? doc.items.map((it) => (it.roomId === roomId ? { ...it, roomId: target, updatedAt: now } : it))
    : doc.items.filter((it) => it.roomId !== roomId);
  return { ...doc, rooms: doc.rooms.filter((r) => r.id !== roomId), items };
}

/** What the item form hands over. Money is already in cents. */
export interface ItemDraft {
  roomId: Id;
  name: string;
  category: Category | null;
  quantity: number;
  valueCents: number | null;
  pricePaidCents: number | null;
  purchaseDate: string | null;
  purchasedFrom: string;
  brand: string;
  model: string;
  serial: string;
  notes: string;
  photos: Photo[];
  receipts: Photo[];
}

export function emptyDraft(roomId: Id): ItemDraft {
  return {
    roomId,
    name: '',
    category: null,
    quantity: 1,
    valueCents: null,
    pricePaidCents: null,
    purchaseDate: null,
    purchasedFrom: '',
    brand: '',
    model: '',
    serial: '',
    notes: '',
    photos: [],
    receipts: [],
  };
}

export function draftFromItem(item: Item): ItemDraft {
  return {
    roomId: item.roomId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    valueCents: item.valueCents,
    pricePaidCents: item.pricePaidCents,
    purchaseDate: item.purchaseDate,
    purchasedFrom: item.purchasedFrom,
    brand: item.brand,
    model: item.model,
    serial: item.serial,
    notes: item.notes,
    photos: item.photos,
    receipts: item.receipts,
  };
}

export type DraftProblem = 'name' | 'room';

export function draftProblems(doc: Doc, draft: ItemDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!cleanText(draft.name, LIMITS.name)) problems.push('name');
  if (!doc.rooms.some((r) => r.id === draft.roomId)) problems.push('room');
  return problems;
}

function fieldsFromDraft(draft: ItemDraft) {
  return {
    roomId: draft.roomId,
    name: cleanText(draft.name, LIMITS.name),
    category: draft.category && (CATEGORIES as readonly string[]).includes(draft.category) ? draft.category : null,
    quantity: cleanQuantity(draft.quantity),
    valueCents: draft.valueCents === null ? null : cleanCents(draft.valueCents),
    pricePaidCents: draft.pricePaidCents === null ? null : cleanCents(draft.pricePaidCents),
    purchaseDate: draft.purchaseDate && isValidYmd(draft.purchaseDate) ? draft.purchaseDate : null,
    purchasedFrom: cleanText(draft.purchasedFrom, LIMITS.short),
    brand: cleanText(draft.brand, LIMITS.short),
    model: cleanText(draft.model, LIMITS.short),
    serial: cleanText(draft.serial, LIMITS.short),
    notes: cleanText(draft.notes, LIMITS.notes, true),
    photos: draft.photos.slice(0, LIMITS.photosPerItem),
    receipts: draft.receipts.slice(0, LIMITS.receiptsPerItem),
  };
}

export function addItem(doc: Doc, draft: ItemDraft, now: number): { doc: Doc; itemId: Id | null } {
  if (draftProblems(doc, draft).length > 0) return { doc, itemId: null };
  const item: Item = { id: newId(), ...fieldsFromDraft(draft), createdAt: now, updatedAt: now };
  return { doc: { ...doc, items: [...doc.items, item] }, itemId: item.id };
}

export function updateItem(doc: Doc, itemId: Id, draft: ItemDraft, now: number): Doc {
  if (draftProblems(doc, draft).length > 0) return doc;
  return {
    ...doc,
    items: doc.items.map((it) => (it.id === itemId ? { ...it, ...fieldsFromDraft(draft), updatedAt: now } : it)),
  };
}

export function deleteItem(doc: Doc, itemId: Id): Doc {
  return { ...doc, items: doc.items.filter((it) => it.id !== itemId) };
}

export function updateProfile(doc: Doc, patch: Partial<Profile>): Doc {
  const merged = { ...doc.profile, ...patch };
  return {
    ...doc,
    profile: {
      homeName: cleanText(merged.homeName, LIMITS.short),
      ownerName: cleanText(merged.ownerName, LIMITS.short),
      address: cleanText(merged.address, LIMITS.address, true),
      insurer: cleanText(merged.insurer, LIMITS.short),
      policyNumber: cleanText(merged.policyNumber, LIMITS.short),
    },
  };
}

export function setCurrency(doc: Doc, currency: string): Doc {
  if (!/^[A-Z]{3}$/.test(currency)) return doc;
  return { ...doc, settings: { ...doc.settings, currency } };
}

export function setOnboarded(doc: Doc): Doc {
  return { ...doc, meta: { ...doc.meta, onboarded: true } };
}

export function markBackup(doc: Doc, now: number): Doc {
  return { ...doc, meta: { ...doc.meta, lastBackupAt: now } };
}

export function markReport(doc: Doc, now: number): Doc {
  return { ...doc, meta: { ...doc.meta, lastReportAt: now } };
}
