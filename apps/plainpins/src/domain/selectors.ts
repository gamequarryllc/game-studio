import { displayYmd, monthAbbr, dayOfMonth, yearOf } from './dates';
import type { Category, Doc, Place, Ymd } from './types';

// Ways of looking at the map: sorted, searched, grouped, counted.

/** Newest visit first; places with no date go last, newest-added first. */
export function byVisit(a: Place, b: Place): number {
  if (a.visitedOn !== b.visitedOn) {
    if (a.visitedOn === null) return 1;
    if (b.visitedOn === null) return -1;
    return a.visitedOn < b.visitedOn ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id < b.id ? -1 : 1;
}

export function sortedPlaces(doc: Doc): Place[] {
  return [...doc.places].sort(byVisit);
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export interface Filter {
  text: string;
  category: Category | null;
  favoritesOnly: boolean;
}

export const NO_FILTER: Filter = { text: '', category: null, favoritesOnly: false };

export function isFiltering(f: Filter): boolean {
  return f.text.trim() !== '' || f.category !== null || f.favoritesOnly;
}

/** Every word typed must be found somewhere in the place: its name, town, country, people or story. */
export function matches(place: Place, f: Filter): boolean {
  if (f.category !== null && place.category !== f.category) return false;
  if (f.favoritesOnly && !place.favorite) return false;
  const words = fold(f.text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold([place.name, place.locality, place.country, place.people.join(' '), place.story, place.visitedOn ? String(yearOf(place.visitedOn)) : ''].join(' '));
  return words.every((w) => hay.includes(w));
}

export function filterPlaces(places: Place[], f: Filter): Place[] {
  return isFiltering(f) ? places.filter((p) => matches(p, f)) : places;
}

export interface YearGroup {
  /** The year, or null for places with no date. */
  year: number | null;
  places: Place[];
}

/** Places (already sorted) cut into years, newest first, undated last. */
export function groupByYear(sorted: Place[]): YearGroup[] {
  const groups: YearGroup[] = [];
  for (const place of sorted) {
    const year = place.visitedOn ? yearOf(place.visitedOn) : null;
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.places.push(place);
    else groups.push({ year, places: [place] });
  }
  return groups;
}

export interface Tally {
  places: number;
  towns: number;
  countries: number;
  photos: number;
}

export function tally(doc: Doc): Tally {
  const towns = new Set<string>();
  const countries = new Set<string>();
  let photos = 0;
  for (const p of doc.places) {
    if (p.locality !== '') towns.add(fold(`${p.locality}|${p.country}`));
    if (p.country !== '') countries.add(fold(p.country));
    photos += p.photos.length;
  }
  return { places: doc.places.length, towns: towns.size, countries: countries.size, photos };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "21 towns · 4 countries": only the parts that say something; empty when neither does. */
export function reachLine(t: Tally): string {
  const parts: string[] = [];
  if (t.towns > 1) parts.push(plural(t.towns, 'town', 'towns'));
  if (t.countries > 1) parts.push(plural(t.countries, 'country', 'countries'));
  return parts.join(' · ');
}

export function placesText(n: number): string {
  return plural(n, 'place', 'places');
}

/** "38 places · 21 towns · 4 countries" */
export function tallyLine(t: Tally): string {
  const reach = reachLine(t);
  return reach === '' ? placesText(t.places) : `${placesText(t.places)} · ${reach}`;
}

/** Everyone ever named, most-often first, for suggesting as you type. */
export function knownPeople(doc: Doc): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const place of doc.places) {
    for (const name of place.people) {
      const key = name.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.n += 1;
      else counts.set(key, { name, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
}

/** "Jul 4, 2025", or "Jul 4 – 6, 2025", or "Dec 30, 2024 – Jan 2, 2025". */
export function visitText(visitedOn: Ymd | null, until: Ymd | null): string {
  if (visitedOn === null) return '';
  if (until === null || until <= visitedOn) return displayYmd(visitedOn);
  if (yearOf(visitedOn) !== yearOf(until)) return `${displayYmd(visitedOn)} – ${displayYmd(until)}`;
  if (monthAbbr(visitedOn) === monthAbbr(until)) return `${monthAbbr(visitedOn)} ${dayOfMonth(visitedOn)} – ${dayOfMonth(until)}, ${yearOf(until)}`;
  return `${monthAbbr(visitedOn)} ${dayOfMonth(visitedOn)} – ${monthAbbr(until)} ${dayOfMonth(until)}, ${yearOf(until)}`;
}

/** "Asheville, North Carolina" plus the country when it is known and not already said. */
export function whereText(place: Pick<Place, 'locality' | 'country'>): string {
  if (place.locality === '') return place.country;
  if (place.country === '' || fold(place.locality).includes(fold(place.country))) return place.locality;
  return `${place.locality}, ${place.country}`;
}

/** The short form for a card or a row: the town if there is one, otherwise the country. */
export function shortWhere(place: Pick<Place, 'locality' | 'country'>): string {
  return place.locality !== '' ? place.locality : place.country;
}

/** "42.9634° N, 85.6681° W" */
export function coordText(lat: number, lng: number): string {
  const part = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  return `${part(lat, 'N', 'S')}, ${part(lng, 'E', 'W')}`;
}

/** "Sam, Riley and Jo" */
export function peopleText(people: string[]): string {
  if (people.length <= 1) return people.join('');
  return `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`;
}
