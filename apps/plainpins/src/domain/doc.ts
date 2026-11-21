import { isValidYmd } from './dates';
import { isSafeId } from './ids';
import { CATEGORIES, LIMITS, SCENES, type Category, type Doc, type Photo, type Place, type Scene, type Settings } from './types';

// Making, reading and writing the document. Reading is strict about shape and
// forgiving about content: a place that cannot be understood is dropped, and
// the rest of the map is kept.

export const DEFAULT_SETTINGS: Settings = { onboarded: false, mapStyle: 'standard' };

export function emptyDoc(now: number, settings: Partial<Settings> = {}): Doc {
  return { format: 1, places: [], settings: { ...DEFAULT_SETTINGS, ...settings }, updatedAt: now };
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc);
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const stamp = (v: unknown, now: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : now);
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** A photo's file name is made by the app; anything that could walk out of the folder is refused. */
export function isSafeFileName(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-z_-]{4,40}\.(jpg|png)$/.test(v);
}

function parsePhoto(v: unknown): Photo | null {
  if (!isObj(v) || !isSafeId(v.id)) return null;
  if (v.kind === 'art') {
    if (!(SCENES as readonly string[]).includes(v.scene as string)) return null;
    return { id: v.id, kind: 'art', scene: v.scene as Scene, seed: inRange(v.seed, 0, 1e9) ? Math.floor(v.seed) : 0 };
  }
  if (v.kind === 'file' && isSafeFileName(v.file)) {
    return { id: v.id, kind: 'file', file: v.file, w: inRange(v.w, 1, 100000) ? Math.round(v.w) : 4, h: inRange(v.h, 1, 100000) ? Math.round(v.h) : 3 };
  }
  return null;
}

/** Trims, drops blanks and repeats (whatever their capitals), and keeps the first spelling. */
export function cleanPeople(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const name = text(raw, LIMITS.person).replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= LIMITS.people) break;
  }
  return out;
}

function parsePlace(v: unknown, now: number): Place | null {
  if (!isObj(v) || !isSafeId(v.id)) return null;
  const name = text(v.name, LIMITS.name).trim();
  if (name === '') return null;
  if (!inRange(v.lat, -90, 90) || !inRange(v.lng, -180, 180)) return null;
  const category: Category = (CATEGORIES as readonly string[]).includes(v.category as string) ? (v.category as Category) : 'other';
  const visitedOn = isValidYmd(v.visitedOn) ? v.visitedOn : null;
  const until = visitedOn !== null && isValidYmd(v.until) && v.until > visitedOn ? v.until : null;
  const photos: Photo[] = [];
  const photoIds = new Set<string>();
  if (Array.isArray(v.photos)) {
    for (const raw of v.photos) {
      const photo = parsePhoto(raw);
      if (!photo || photoIds.has(photo.id)) continue;
      photoIds.add(photo.id);
      photos.push(photo);
      if (photos.length >= LIMITS.photos) break;
    }
  }
  const createdAt = stamp(v.createdAt, now);
  return {
    id: v.id,
    name,
    category,
    lat: v.lat,
    lng: v.lng,
    locality: text(v.locality, LIMITS.locality).trim(),
    country: text(v.country, LIMITS.locality).trim(),
    visitedOn,
    until,
    story: text(v.story, LIMITS.story),
    people: cleanPeople(v.people),
    photos,
    favorite: v.favorite === true,
    createdAt,
    updatedAt: stamp(v.updatedAt, createdAt),
  };
}

function parseSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  return { onboarded: s.onboarded === true, mapStyle: s.mapStyle === 'satellite' ? 'satellite' : 'standard' };
}

/** Reads a document from an object. Throws when it is not this app's document at all. */
export function parseDoc(value: unknown, now: number): Doc {
  if (!isObj(value)) throw new Error('Not a map document');
  if (value.format !== 1) throw new Error(typeof value.format === 'number' && value.format > 1 ? 'Made by a newer version' : 'Not a map document');
  if (!Array.isArray(value.places)) throw new Error('Not a map document');
  const places: Place[] = [];
  const ids = new Set<string>();
  for (const raw of value.places.slice(0, LIMITS.places)) {
    const place = parsePlace(raw, now);
    if (!place || ids.has(place.id)) continue;
    ids.add(place.id);
    places.push(place);
  }
  return { format: 1, places, settings: parseSettings(value.settings), updatedAt: stamp(value.updatedAt, now) };
}

export function parseDocText(textValue: string, now: number): Doc {
  return parseDoc(JSON.parse(textValue) as unknown, now);
}

/** The names of every photo file the document points at. */
export function photoFiles(doc: Doc): string[] {
  const out: string[] = [];
  for (const place of doc.places) for (const photo of place.photos) if (photo.kind === 'file') out.push(photo.file);
  return out;
}
