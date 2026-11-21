// The whole map is one small document: the places, and a few settings.
// Photos are files beside it; the document only holds their names.

export type Id = string;
/** A calendar day, YYYY-MM-DD. */
export type Ymd = string;

export const CATEGORIES = ['beach', 'park', 'trail', 'water', 'city', 'food', 'museum', 'stay', 'event', 'landmark', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** The drawn stand-ins the sample map uses where a real photo would be. */
export const SCENES = ['beach', 'dunes', 'lighthouse', 'forest', 'lake', 'river', 'city', 'garden', 'mountain', 'snow', 'market', 'hall'] as const;
export type Scene = (typeof SCENES)[number];

export type Photo =
  /** A picture kept in the app's own folder. */
  | { id: Id; kind: 'file'; file: string; w: number; h: number }
  /** A drawn placeholder (sample map only). */
  | { id: Id; kind: 'art'; scene: Scene; seed: number };

export interface Place {
  id: Id;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  /** "Asheville, North Carolina": the town and region, as looked up or typed. */
  locality: string;
  country: string;
  /** The day of the visit, or its first day. */
  visitedOn: Ymd | null;
  /** The last day, when the visit was longer than one. */
  until: Ymd | null;
  /** What we did there. */
  story: string;
  /** Who was there. */
  people: string[];
  /** The first photo is the cover. */
  photos: Photo[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MapStyle = 'standard' | 'satellite';

export interface Settings {
  onboarded: boolean;
  mapStyle: MapStyle;
}

export interface Doc {
  format: 1;
  places: Place[];
  settings: Settings;
  updatedAt: number;
}

export const LIMITS = {
  name: 80,
  locality: 80,
  story: 4000,
  person: 40,
  people: 24,
  /** The most photos any one place can hold, with Pro. */
  photos: 40,
  places: 5000,
} as const;
