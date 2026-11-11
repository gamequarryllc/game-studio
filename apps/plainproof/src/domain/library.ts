import { DocError, cleanText, emptyDoc, parseDoc, photoIdsInUse } from './doc';
import { isSafeId, newId } from './ids';
import { addRooms, type RoomSeed } from './actions';
import { itemTotalCents } from './selectors';
import { LIMITS, type Doc, type Id } from './types';

// Everything the app keeps: one or more places, each with its own inventory.
// A place is a file cabinet (a home, a rental, an office, a storage unit); its
// document is exactly what the app kept when there was only ever one home, so
// every screen still works on one document at a time: the current place's.

export const LIBRARY_FORMAT = 'plainproof-library';
export const LIBRARY_VERSION = 2;

export const PLACE_KINDS = ['home', 'rental', 'office', 'storage', 'other'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  home: 'Home',
  rental: 'Rental property',
  office: 'Office or business',
  storage: 'Storage unit',
  other: 'Somewhere else',
};

/** The free version keeps one place. Pro removes the limit. */
export const FREE_PLACE_LIMIT = 1;
export const MAX_PLACES = 24;

export interface Place {
  id: Id;
  kind: PlaceKind;
  doc: Doc;
}

export interface Library {
  version: typeof LIBRARY_VERSION;
  currentId: Id;
  places: Place[];
}

/** A library with one place: how a fresh install starts, and what an older single-home document becomes. */
export function libraryOf(doc: Doc, kind: PlaceKind = 'home'): Library {
  const id = newId();
  return { version: LIBRARY_VERSION, currentId: id, places: [{ id, kind, doc }] };
}

export function currentPlace(lib: Library): Place {
  return lib.places.find((p) => p.id === lib.currentId) ?? lib.places[0];
}

export function currentDoc(lib: Library): Doc {
  return currentPlace(lib).doc;
}

/** Puts a changed document back as the current place's. */
export function setCurrentDoc(lib: Library, doc: Doc): Library {
  const at = currentPlace(lib);
  if (at.doc === doc) return lib;
  return { ...lib, places: lib.places.map((p) => (p.id === at.id ? { ...p, doc } : p)) };
}

/** Applies one change to every place's document (the currency, the time of a backup). */
export function mapDocs(lib: Library, change: (doc: Doc) => Doc): Library {
  return { ...lib, places: lib.places.map((p) => ({ ...p, doc: change(p.doc) })) };
}

export function switchPlace(lib: Library, id: Id): Library {
  if (lib.currentId === id || !lib.places.some((p) => p.id === id)) return lib;
  return { ...lib, currentId: id };
}

/** What a place is called. A home nobody has named yet is "Household", as it always was. */
export function placeName(place: Place): string {
  return place.doc.profile.homeName || (place.kind === 'home' ? 'Household' : PLACE_KIND_LABELS[place.kind]);
}

/** A few rooms to start a new place with, so its drawer is never empty. They can be renamed or deleted. */
export const STARTER_ROOMS: Record<PlaceKind, readonly RoomSeed[]> = {
  home: [
    { name: 'Living room', icon: 'sofa' },
    { name: 'Kitchen', icon: 'kitchen' },
    { name: 'Bedroom', icon: 'bed' },
    { name: 'Bathroom', icon: 'bath' },
  ],
  rental: [
    { name: 'Living room', icon: 'sofa' },
    { name: 'Kitchen', icon: 'kitchen' },
    { name: 'Bedroom', icon: 'bed' },
    { name: 'Bathroom', icon: 'bath' },
  ],
  office: [
    { name: 'Office', icon: 'desk' },
    { name: 'Front desk', icon: 'hall' },
    { name: 'Storage room', icon: 'storage' },
  ],
  storage: [{ name: 'Unit', icon: 'box' }],
  other: [{ name: 'Main room', icon: 'box' }],
};

/** Adds a place and makes it the current one. It takes the currency and the owner's name from the place before it. */
export function addPlace(lib: Library, name: string, kind: PlaceKind, now: number): { library: Library; placeId: Id | null } {
  const clean = cleanText(name, LIMITS.name);
  if (clean === '' || lib.places.length >= MAX_PLACES) return { library: lib, placeId: null };
  const from = currentDoc(lib);
  let doc = emptyDoc(now, from.settings.currency);
  doc = { ...doc, profile: { ...doc.profile, homeName: clean, ownerName: from.profile.ownerName }, meta: { ...doc.meta, onboarded: true } };
  doc = addRooms(doc, STARTER_ROOMS[kind], now);
  const id = newId();
  return { library: { ...lib, currentId: id, places: [...lib.places, { id, kind, doc }] }, placeId: id };
}

export function renamePlace(lib: Library, id: Id, name: string): Library {
  const clean = cleanText(name, LIMITS.name);
  if (clean === '') return lib;
  return { ...lib, places: lib.places.map((p) => (p.id === id ? { ...p, doc: { ...p.doc, profile: { ...p.doc.profile, homeName: clean } } } : p)) };
}

export function setPlaceKind(lib: Library, id: Id, kind: PlaceKind): Library {
  return { ...lib, places: lib.places.map((p) => (p.id === id ? { ...p, kind } : p)) };
}

/** Removes a place and everything in it. The last place can't be removed: there is always one cabinet. */
export function removePlace(lib: Library, id: Id): Library {
  if (lib.places.length <= 1 || !lib.places.some((p) => p.id === id)) return lib;
  const places = lib.places.filter((p) => p.id !== id);
  return { ...lib, places, currentId: lib.currentId === id ? places[0].id : lib.currentId };
}

/** Items across every place: what the free limit counts. */
export function totalItems(lib: Library): number {
  return lib.places.reduce((n, p) => n + p.doc.items.length, 0);
}

export function totalRooms(lib: Library): number {
  return lib.places.reduce((n, p) => n + p.doc.rooms.length, 0);
}

/** Every photo file any place still points at. */
export function libraryPhotoIds(lib: Library): Set<string> {
  const ids = new Set<string>();
  for (const p of lib.places) for (const id of photoIdsInUse(p.doc)) ids.add(id);
  return ids;
}

export function canAddPlace(lib: Library, isPro: boolean): boolean {
  if (lib.places.length >= MAX_PLACES) return false;
  return isPro || lib.places.length < FREE_PLACE_LIMIT;
}

export interface PlaceSummary {
  id: Id;
  kind: PlaceKind;
  name: string;
  current: boolean;
  count: number;
  rooms: number;
  totalCents: number;
  currency: string;
}

export function placeSummaries(lib: Library): PlaceSummary[] {
  const at = currentPlace(lib).id;
  return lib.places.map((p) => ({
    id: p.id,
    kind: p.kind,
    name: placeName(p),
    current: p.id === at,
    count: p.doc.items.length,
    rooms: p.doc.rooms.length,
    totalCents: p.doc.items.reduce((n, item) => n + itemTotalCents(item), 0),
    currency: p.doc.settings.currency,
  }));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Reads what was saved, repairing what it can. A file from before places
 * existed is one home's document: it becomes a library with that one place.
 */
export function parseLibrary(raw: unknown, now: number): Library {
  if (!isRecord(raw) || raw.format !== LIBRARY_FORMAT) return libraryOf(parseDoc(raw, now));
  if (typeof raw.version === 'number' && raw.version > LIBRARY_VERSION) {
    throw new DocError('This was made by a newer version of Plainproof.', 'too-new');
  }
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const entry of Array.isArray(raw.places) ? raw.places.slice(0, MAX_PLACES) : []) {
    if (!isRecord(entry)) continue;
    let doc: Doc;
    try {
      doc = parseDoc(entry.doc, now);
    } catch (e) {
      // A place written by a newer version must not be dropped quietly: refuse the whole file instead.
      if (e instanceof DocError && e.reason === 'too-new') throw e;
      continue;
    }
    let id = isSafeId(entry.id) && !seen.has(entry.id) ? entry.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const kind = (PLACE_KINDS as readonly unknown[]).includes(entry.kind) ? (entry.kind as PlaceKind) : 'home';
    places.push({ id, kind, doc });
  }
  if (places.length === 0) throw new DocError('This file could not be read.', 'not-a-document');
  const currentId = typeof raw.currentId === 'string' && seen.has(raw.currentId) ? raw.currentId : places[0].id;
  return { version: LIBRARY_VERSION, currentId, places };
}

export function parseLibraryText(text: string, now: number): Library {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocError('This file could not be read.', 'not-a-document');
  }
  return parseLibrary(raw, now);
}

export function serializeLibrary(lib: Library): string {
  return JSON.stringify({ format: LIBRARY_FORMAT, ...lib });
}
