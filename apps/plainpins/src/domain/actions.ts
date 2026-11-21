import { cleanPeople } from './doc';
import { newId } from './ids';
import { LIMITS, type Category, type Doc, type Id, type MapStyle, type Photo, type Place, type Ymd } from './types';

// Every change to the map is one of these: a function from the document to a
// new document. Nothing here touches the phone, so all of it can be tested.

export interface PlaceDraft {
  name: string;
  category: Category;
  lat: number;
  lng: number;
  locality: string;
  country: string;
  visitedOn: Ymd | null;
  until: Ymd | null;
  story: string;
  people: string[];
  photos: Photo[];
  favorite: boolean;
}

function tidy(draft: PlaceDraft): PlaceDraft {
  const visitedOn = draft.visitedOn;
  return {
    ...draft,
    name: draft.name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name),
    locality: draft.locality.trim().slice(0, LIMITS.locality),
    country: draft.country.trim().slice(0, LIMITS.locality),
    // A visit can't end before it starts; a one-day visit has no last day.
    until: visitedOn !== null && draft.until !== null && draft.until > visitedOn ? draft.until : null,
    story: draft.story.replace(/\s+$/, '').slice(0, LIMITS.story),
    people: cleanPeople(draft.people),
    photos: draft.photos.slice(0, LIMITS.photos),
    lat: Math.max(-90, Math.min(90, draft.lat)),
    lng: wrapLng(draft.lng),
  };
}

/** Brings any longitude back between -180 and 180. */
export function wrapLng(lng: number): number {
  // A longitude already in range is left exactly as it is: wrapping it would smudge its last digits.
  if (lng >= -180 && lng <= 180) return lng;
  const w = ((((lng + 180) % 360) + 360) % 360) - 180;
  return w === -180 && lng > 0 ? 180 : w;
}

export function draftProblem(draft: PlaceDraft): string | null {
  if (draft.name.trim() === '') return 'Give the place a name.';
  if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) return 'Put the pin somewhere on the map.';
  return null;
}

export function addPlace(doc: Doc, draft: PlaceDraft, now: number, id: Id = newId()): Doc {
  if (draftProblem(draft) !== null) return doc;
  const place: Place = { id, ...tidy(draft), createdAt: now, updatedAt: now };
  return { ...doc, places: [...doc.places, place], updatedAt: now };
}

export function updatePlace(doc: Doc, id: Id, draft: PlaceDraft, now: number): Doc {
  if (draftProblem(draft) !== null || !doc.places.some((p) => p.id === id)) return doc;
  return { ...doc, places: doc.places.map((p) => (p.id === id ? { ...p, ...tidy(draft), updatedAt: now } : p)), updatedAt: now };
}

export function removePlace(doc: Doc, id: Id, now: number): Doc {
  if (!doc.places.some((p) => p.id === id)) return doc;
  return { ...doc, places: doc.places.filter((p) => p.id !== id), updatedAt: now };
}

export function toggleFavorite(doc: Doc, id: Id, now: number): Doc {
  if (!doc.places.some((p) => p.id === id)) return doc;
  return { ...doc, places: doc.places.map((p) => (p.id === id ? { ...p, favorite: !p.favorite, updatedAt: now } : p)), updatedAt: now };
}

export function setMapStyle(doc: Doc, mapStyle: MapStyle, now: number): Doc {
  if (doc.settings.mapStyle === mapStyle) return doc;
  return { ...doc, settings: { ...doc.settings, mapStyle }, updatedAt: now };
}

export function setOnboarded(doc: Doc, now: number): Doc {
  if (doc.settings.onboarded) return doc;
  return { ...doc, settings: { ...doc.settings, onboarded: true }, updatedAt: now };
}

export function draftOf(place: Place): PlaceDraft {
  const { name, category, lat, lng, locality, country, visitedOn, until, story, people, photos, favorite } = place;
  return { name, category, lat, lng, locality, country, visitedOn, until, story, people, photos, favorite };
}

/** Photo files a change let go of: they were in `before` and are not in `after`. */
export function droppedFiles(before: Photo[], after: Photo[]): string[] {
  const kept = new Set(after.filter((p) => p.kind === 'file').map((p) => (p.kind === 'file' ? p.file : '')));
  return before.flatMap((p) => (p.kind === 'file' && !kept.has(p.file) ? [p.file] : []));
}
