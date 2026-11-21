import { addPlace, draftOf, draftProblem, droppedFiles, removePlace, setMapStyle, setOnboarded, toggleFavorite, updatePlace, wrapLng, type PlaceDraft } from '../actions';
import { BACKUP_KIND, makeBackup, readBackup } from '../backup';
import { CATEGORY_INFO } from '../categories';
import { displayYmd, isValidYmd, weekdayName } from '../dates';
import { cleanPeople, emptyDoc, isSafeFileName, parseDoc, parseDocText, photoFiles, serializeDoc } from '../doc';
import { GLOBE_ZOOM, PLACE_ZOOM, arcDegrees, cameraFor, centerOf } from '../geo';
import { isSafeId, newId } from '../ids';
import { FREE_PHOTO_LIMIT, FREE_PLACE_LIMIT, canAddPlace, freePlacesLeft, photoLimit, photoRoom } from '../limits';
import { SAMPLE_COUNTS, sampleDoc } from '../sample';
import { NO_FILTER, coordText, filterPlaces, groupByYear, knownPeople, matches, peopleText, placesText, reachLine, shortWhere, sortedPlaces, tally, tallyLine, visitText, whereText } from '../selectors';
import { CATEGORIES, LIMITS, SCENES, type Doc, type Photo } from '../types';

const NOW = 1_800_000_000_000;

function draft(over: Partial<PlaceDraft> = {}): PlaceDraft {
  return { name: 'Holland State Park', category: 'beach', lat: 42.7737, lng: -86.2104, locality: 'Holland, MI', country: 'United States', visitedOn: '2026-07-18', until: null, story: 'Swam.', people: ['Maya'], photos: [], favorite: false, ...over };
}

function docWith(...drafts: PlaceDraft[]): Doc {
  let doc = emptyDoc(NOW);
  drafts.forEach((d, i) => {
    doc = addPlace(doc, d, NOW + i, `place-${i}`);
  });
  return doc;
}

const file = (n: number): Photo => ({ id: `photo-${n}`, kind: 'file', file: `photo-${n}.jpg`, w: 800, h: 600 });
const art = (n: number): Photo => ({ id: `art-${n}`, kind: 'art', scene: 'beach', seed: n });

describe('dates', () => {
  test('validity', () => {
    expect(isValidYmd('2024-02-29')).toBe(true);
    expect(isValidYmd('2025-02-29')).toBe(false);
    expect(isValidYmd('2025-13-01')).toBe(false);
    expect(isValidYmd('nope')).toBe(false);
    expect(isValidYmd(20250101)).toBe(false);
  });
  test('display', () => {
    expect(displayYmd('2026-07-04')).toBe('Jul 4, 2026');
    expect(weekdayName('2026-07-04')).toBe('Saturday');
  });
});

describe('ids', () => {
  test('new ids are safe and differ', () => {
    const a = newId();
    expect(isSafeId(a)).toBe(true);
    expect(newId()).not.toBe(a);
    expect(isSafeId('../etc')).toBe(false);
    expect(isSafeId('ab')).toBe(false);
  });
  test('photo file names cannot leave the folder', () => {
    expect(isSafeFileName('abcd1234.jpg')).toBe(true);
    expect(isSafeFileName('../abcd.jpg')).toBe(false);
    expect(isSafeFileName('abcd.exe')).toBe(false);
    expect(isSafeFileName('a/b.jpg')).toBe(false);
  });
});

describe('adding and changing places', () => {
  test('a place is added with tidied text', () => {
    const doc = docWith(draft({ name: '  Holland   State Park ', story: 'Swam.  \n\n', people: [' Maya ', 'maya', '', 'Jordan'] }));
    expect(doc.places).toHaveLength(1);
    expect(doc.places[0].name).toBe('Holland State Park');
    expect(doc.places[0].story).toBe('Swam.');
    expect(doc.places[0].people).toEqual(['Maya', 'Jordan']);
    expect(doc.places[0].createdAt).toBe(NOW);
  });
  test('a place needs a name and a pin', () => {
    expect(draftProblem(draft({ name: '   ' }))).not.toBeNull();
    expect(draftProblem(draft({ lat: NaN }))).not.toBeNull();
    expect(draftProblem(draft())).toBeNull();
    const before = emptyDoc(NOW);
    expect(addPlace(before, draft({ name: '' }), NOW)).toBe(before);
    expect(addPlace(before, draft({ lng: NaN }), NOW)).toBe(before);
  });
  test('a last day before the first is dropped', () => {
    expect(docWith(draft({ until: '2026-07-10' })).places[0].until).toBeNull();
    expect(docWith(draft({ until: '2026-07-18' })).places[0].until).toBeNull();
    expect(docWith(draft({ until: '2026-07-20' })).places[0].until).toBe('2026-07-20');
    expect(docWith(draft({ visitedOn: null, until: '2026-07-20' })).places[0].until).toBeNull();
  });
  test('long text and far-off pins are brought within bounds', () => {
    const place = docWith(draft({ name: 'x'.repeat(500), story: 'y'.repeat(9000), lat: 123, lng: 190 })).places[0];
    expect(place.name).toHaveLength(LIMITS.name);
    expect(place.story).toHaveLength(LIMITS.story);
    expect(place.lat).toBe(90);
    expect(place.lng).toBe(-170);
  });
  test('longitudes wrap', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
    expect(wrapLng(180)).toBe(180);
    expect(wrapLng(0)).toBe(0);
    expect(wrapLng(540)).toBe(180);
  });
  test('update, favorite and remove', () => {
    let doc = docWith(draft(), draft({ name: 'Grand Haven pier' }));
    doc = updatePlace(doc, 'place-0', draft({ name: 'Big Red', favorite: true }), NOW + 50);
    expect(doc.places[0].name).toBe('Big Red');
    expect(doc.places[0].createdAt).toBe(NOW);
    expect(doc.places[0].updatedAt).toBe(NOW + 50);
    expect(updatePlace(doc, 'missing', draft(), NOW)).toBe(doc);
    expect(updatePlace(doc, 'place-0', draft({ name: '' }), NOW)).toBe(doc);
    doc = toggleFavorite(doc, 'place-1', NOW + 60);
    expect(doc.places[1].favorite).toBe(true);
    expect(toggleFavorite(doc, 'missing', NOW)).toBe(doc);
    doc = removePlace(doc, 'place-0', NOW + 70);
    expect(doc.places.map((p) => p.id)).toEqual(['place-1']);
    expect(removePlace(doc, 'place-0', NOW)).toBe(doc);
  });
  test('draftOf round-trips a place', () => {
    const d = draft({ photos: [file(1)], people: ['Maya', 'Jordan'], until: '2026-07-20' });
    expect(draftOf(docWith(d).places[0])).toEqual(d);
  });
  test('settings', () => {
    const doc = emptyDoc(NOW);
    expect(setMapStyle(doc, 'standard', NOW)).toBe(doc);
    expect(setMapStyle(doc, 'satellite', NOW).settings.mapStyle).toBe('satellite');
    expect(setOnboarded(doc, NOW).settings.onboarded).toBe(true);
    const done = setOnboarded(doc, NOW);
    expect(setOnboarded(done, NOW)).toBe(done);
  });
  test('files a change let go of', () => {
    expect(droppedFiles([file(1), file(2), art(1)], [file(2)])).toEqual(['photo-1.jpg']);
    expect(droppedFiles([file(1)], [file(1), file(3)])).toEqual([]);
    expect(droppedFiles([file(1), file(2)], [])).toEqual(['photo-1.jpg', 'photo-2.jpg']);
  });
});

describe('free and Pro limits', () => {
  test('places', () => {
    expect(canAddPlace(0, false)).toBe(true);
    expect(canAddPlace(FREE_PLACE_LIMIT - 1, false)).toBe(true);
    expect(canAddPlace(FREE_PLACE_LIMIT, false)).toBe(false);
    expect(canAddPlace(FREE_PLACE_LIMIT + 40, false)).toBe(false);
    expect(canAddPlace(FREE_PLACE_LIMIT, true)).toBe(true);
    expect(canAddPlace(LIMITS.places, true)).toBe(false);
    expect(freePlacesLeft(3, false)).toBe(FREE_PLACE_LIMIT - 3);
    expect(freePlacesLeft(999, false)).toBe(0);
    expect(freePlacesLeft(3, true)).toBeNull();
  });
  test('photos', () => {
    expect(photoLimit(false)).toBe(FREE_PHOTO_LIMIT);
    expect(photoLimit(true)).toBe(LIMITS.photos);
    expect(photoRoom(0, false)).toBe(FREE_PHOTO_LIMIT);
    expect(photoRoom(FREE_PHOTO_LIMIT, false)).toBe(0);
    expect(photoRoom(FREE_PHOTO_LIMIT + 3, false)).toBe(0);
    expect(photoRoom(FREE_PHOTO_LIMIT, true)).toBe(LIMITS.photos - FREE_PHOTO_LIMIT);
    expect(photoRoom(LIMITS.photos, true)).toBe(0);
  });
  test('the free version is a real app: the limits are generous', () => {
    expect(FREE_PLACE_LIMIT).toBeGreaterThanOrEqual(20);
    expect(FREE_PHOTO_LIMIT).toBeGreaterThanOrEqual(4);
  });
});

describe('reading a document', () => {
  test('round trip', () => {
    const doc = docWith(draft({ photos: [file(1), art(2)] }), draft({ name: 'Rome', lat: 41.9, lng: 12.48, country: 'Italy', locality: 'Rome' }));
    expect(parseDocText(serializeDoc(doc), NOW)).toEqual(doc);
  });
  test('rejects what is not a map', () => {
    expect(() => parseDoc(null, NOW)).toThrow();
    expect(() => parseDoc({ format: 1 }, NOW)).toThrow();
    expect(() => parseDoc({ format: 2, places: [] }, NOW)).toThrow(/newer version/);
    expect(() => parseDocText('not json', NOW)).toThrow();
  });
  test('drops places it cannot understand and keeps the rest', () => {
    const doc = parseDoc(
      {
        format: 1,
        places: [
          { id: 'good-1', name: 'Good', lat: 1, lng: 2 },
          { id: 'good-1', name: 'Same id again', lat: 1, lng: 2 },
          { id: '../bad', name: 'Bad id', lat: 1, lng: 2 },
          { id: 'noname', name: '   ', lat: 1, lng: 2 },
          { id: 'nolat', name: 'No pin', lat: 'x', lng: 2 },
          { id: 'farlat', name: 'Off the Earth', lat: 91, lng: 2 },
          'junk',
        ],
      },
      NOW,
    );
    expect(doc.places.map((p) => p.id)).toEqual(['good-1']);
    const p = doc.places[0];
    expect(p.category).toBe('other');
    expect(p.visitedOn).toBeNull();
    expect(p.people).toEqual([]);
    expect(p.photos).toEqual([]);
    expect(p.favorite).toBe(false);
    expect(doc.settings).toEqual({ onboarded: false, mapStyle: 'standard' });
  });
  test('drops photos that are not safe', () => {
    const doc = parseDoc(
      {
        format: 1,
        places: [
          {
            id: 'good-1',
            name: 'Good',
            lat: 1,
            lng: 2,
            photos: [
              { id: 'ph-01', kind: 'file', file: '../../secret.jpg', w: 1, h: 1 },
              { id: 'ph-02', kind: 'file', file: 'abcd1234.jpg', w: 10, h: 20 },
              { id: 'ph-02', kind: 'file', file: 'abcd9999.jpg', w: 10, h: 20 },
              { id: 'ph-03', kind: 'art', scene: 'volcano', seed: 1 },
              { id: 'ph-04', kind: 'art', scene: 'beach', seed: 4.7 },
            ],
          },
        ],
      },
      NOW,
    );
    expect(doc.places[0].photos).toEqual([
      { id: 'ph-02', kind: 'file', file: 'abcd1234.jpg', w: 10, h: 20 },
      { id: 'ph-04', kind: 'art', scene: 'beach', seed: 4 },
    ]);
    expect(photoFiles(doc)).toEqual(['abcd1234.jpg']);
  });
  test('people are trimmed, de-duplicated and capped', () => {
    expect(cleanPeople([' Sam ', 'sam', 'SAM', 3, 'Jo  Ann'])).toEqual(['Sam', 'Jo Ann']);
    expect(cleanPeople('Sam')).toEqual([]);
    expect(cleanPeople(Array.from({ length: 60 }, (_, i) => `P${i}`))).toHaveLength(LIMITS.people);
  });
});

describe('looking at the map', () => {
  const doc = docWith(
    draft({ name: 'Older', visitedOn: '2024-05-01' }),
    draft({ name: 'Newest', visitedOn: '2026-01-02', favorite: true, category: 'food', people: ['Jordan', 'Maya'] }),
    draft({ name: 'No date', visitedOn: null }),
    draft({ name: 'Trevi Fountain', visitedOn: '2024-09-01', locality: 'Rome', country: 'Italy', story: 'Threw a coin', people: ['Renée'], category: 'landmark' }),
  );
  test('newest first, undated last', () => {
    expect(sortedPlaces(doc).map((p) => p.name)).toEqual(['Newest', 'Trevi Fountain', 'Older', 'No date']);
  });
  test('grouped by year', () => {
    const groups = groupByYear(sortedPlaces(doc));
    expect(groups.map((g) => [g.year, g.places.length])).toEqual([[2026, 1], [2024, 2], [null, 1]]);
  });
  test('search looks at names, towns, people, story and year, ignoring accents and case', () => {
    const find = (text: string) => filterPlaces(doc.places, { ...NO_FILTER, text }).map((p) => p.name);
    expect(find('trevi')).toEqual(['Trevi Fountain']);
    expect(find('ITALY')).toEqual(['Trevi Fountain']);
    expect(find('renee')).toEqual(['Trevi Fountain']);
    expect(find('coin rome')).toEqual(['Trevi Fountain']);
    expect(find('2026')).toEqual(['Newest']);
    expect(find('jordan')).toEqual(['Newest']);
    expect(find('zzz')).toEqual([]);
    expect(find('   ')).toHaveLength(4);
  });
  test('filters combine', () => {
    expect(filterPlaces(doc.places, { text: '', category: 'food', favoritesOnly: false }).map((p) => p.name)).toEqual(['Newest']);
    expect(filterPlaces(doc.places, { text: '', category: null, favoritesOnly: true }).map((p) => p.name)).toEqual(['Newest']);
    expect(filterPlaces(doc.places, { text: 'older', category: 'food', favoritesOnly: false })).toEqual([]);
    expect(matches(doc.places[0], NO_FILTER)).toBe(true);
  });
  test('tally', () => {
    const t = tally(doc);
    expect(t).toEqual({ places: 4, towns: 2, countries: 2, photos: 0 });
    expect(tallyLine(t)).toBe('4 places · 2 towns · 2 countries');
    expect(reachLine(t)).toBe('2 towns · 2 countries');
    expect(tallyLine({ places: 1, towns: 1, countries: 1, photos: 0 })).toBe('1 place');
    expect(reachLine({ places: 1, towns: 1, countries: 1, photos: 0 })).toBe('');
    expect(placesText(0)).toBe('0 places');
  });
  test('known people, most often first', () => {
    expect(knownPeople(doc)).toEqual(['Maya', 'Jordan', 'Renée']);
  });
  test('wording', () => {
    expect(visitText(null, null)).toBe('');
    expect(visitText('2025-07-04', null)).toBe('Jul 4, 2025');
    expect(visitText('2025-07-04', '2025-07-06')).toBe('Jul 4 – 6, 2025');
    expect(visitText('2025-06-28', '2025-07-02')).toBe('Jun 28 – Jul 2, 2025');
    expect(visitText('2024-12-30', '2025-01-02')).toBe('Dec 30, 2024 – Jan 2, 2025');
    expect(whereText({ locality: 'Rome', country: 'Italy' })).toBe('Rome, Italy');
    expect(whereText({ locality: '', country: 'Italy' })).toBe('Italy');
    expect(whereText({ locality: 'Rome, Italy', country: 'Italy' })).toBe('Rome, Italy');
    expect(whereText({ locality: '', country: '' })).toBe('');
    expect(shortWhere({ locality: 'Rome', country: 'Italy' })).toBe('Rome');
    expect(shortWhere({ locality: '', country: 'Italy' })).toBe('Italy');
    expect(coordText(42.9634, -85.6681)).toBe('42.9634° N, 85.6681° W');
    expect(coordText(-33.8568, 151.2153)).toBe('33.8568° S, 151.2153° E');
    expect(peopleText([])).toBe('');
    expect(peopleText(['Sam'])).toBe('Sam');
    expect(peopleText(['Sam', 'Jo'])).toBe('Sam and Jo');
    expect(peopleText(['Sam', 'Riley', 'Jo'])).toBe('Sam, Riley and Jo');
  });
});

describe('where to point the map', () => {
  test('no pins: the globe', () => {
    expect(cameraFor([]).zoom).toBe(GLOBE_ZOOM);
    expect(centerOf([])).toBeNull();
  });
  test('one pin: a close look', () => {
    expect(cameraFor([{ lat: 10, lng: 20 }])).toEqual({ lat: expect.closeTo(10, 6), lng: expect.closeTo(20, 6), zoom: PLACE_ZOOM });
  });
  test('pins either side of the date line average across it, not round the world', () => {
    const c = centerOf([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }]);
    expect(Math.abs(Math.abs(c!.lng) - 180)).toBeLessThan(1e-6);
  });
  test('a spread of pins is all in view', () => {
    const pins = [{ lat: 42.96, lng: -85.67 }, { lat: 42.77, lng: -86.21 }, { lat: 43.06, lng: -86.25 }];
    const cam = cameraFor(pins);
    const span = 360 / Math.pow(2, cam.zoom);
    for (const p of pins) expect(arcDegrees(cam, p)).toBeLessThan(span / 2);
    expect(cam.zoom).toBeGreaterThan(6);
    expect(cam.zoom).toBeLessThanOrEqual(PLACE_ZOOM);
  });
  test('pins across the world: the globe', () => {
    expect(cameraFor([{ lat: 41.9, lng: 12.5 }, { lat: 34.97, lng: 135.77 }, { lat: 42.96, lng: -85.67 }]).zoom).toBeLessThan(2);
  });
  test('distance', () => {
    expect(arcDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(90, 6);
    expect(arcDegrees({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
  });
});

describe('backup', () => {
  const doc = docWith(draft({ photos: [file(1), file(2), art(3)] }));
  test('round trip with photos', () => {
    const text = makeBackup(doc, { 'photo-1.jpg': 'AAAA', 'photo-2.jpg': 'BBBB' }, NOW);
    const read = readBackup(text, NOW);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.doc.places[0].photos).toHaveLength(3);
    expect(read.photos).toEqual({ 'photo-1.jpg': 'AAAA', 'photo-2.jpg': 'BBBB' });
    expect(read.doc.settings.onboarded).toBe(true);
    expect(read.exportedAt).toBe(NOW);
  });
  test('a photo whose bytes are missing is left off, and strays are ignored', () => {
    const text = makeBackup(doc, { 'photo-1.jpg': 'AAAA', 'stray999.jpg': 'CCCC', '../evil.jpg': 'DDDD' }, NOW);
    const read = readBackup(text, NOW);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.doc.places[0].photos.map((p) => p.id)).toEqual(['photo-1', 'art-3']);
    expect(Object.keys(read.photos)).toEqual(['photo-1.jpg']);
  });
  test('photo data that is not base64 is refused', () => {
    const read = readBackup(makeBackup(doc, { 'photo-1.jpg': '<script>' }, NOW), NOW);
    expect(read.ok && read.doc.places[0].photos.map((p) => p.id)).toEqual(['art-3']);
  });
  test('problems', () => {
    expect(readBackup('nonsense', NOW)).toEqual({ ok: false, problem: 'not-a-backup' });
    expect(readBackup('{"kind":"other"}', NOW)).toEqual({ ok: false, problem: 'not-a-backup' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 2, doc }), NOW)).toEqual({ ok: false, problem: 'newer-version' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, doc: { format: 9, places: [] } }), NOW)).toEqual({ ok: false, problem: 'newer-version' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, doc: 'x' }), NOW)).toEqual({ ok: false, problem: 'damaged' });
    expect(readBackup('﻿' + makeBackup(doc, {}, NOW), NOW).ok).toBe(true);
  });
});

describe('the sample map', () => {
  const full = sampleDoc(NOW, 'full');
  const starter = sampleDoc(NOW, 'starter');
  test('sizes', () => {
    expect(full.places).toHaveLength(SAMPLE_COUNTS.full);
    expect(starter.places).toHaveLength(SAMPLE_COUNTS.starter);
    expect(SAMPLE_COUNTS.full).toBeGreaterThan(FREE_PLACE_LIMIT);
    expect(SAMPLE_COUNTS.starter).toBeLessThanOrEqual(FREE_PLACE_LIMIT);
    expect(SAMPLE_COUNTS.starter).toBeGreaterThanOrEqual(5);
  });
  test('survives being saved and read back unchanged', () => {
    expect(parseDocText(serializeDoc(full), NOW)).toEqual(full);
  });
  test('every place is complete, with drawn pictures only', () => {
    const ids = new Set<string>();
    for (const p of full.places) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name.length).toBeGreaterThan(2);
      expect(CATEGORIES).toContain(p.category);
      expect(p.locality).not.toBe('');
      expect(p.country).not.toBe('');
      expect(isValidYmd(p.visitedOn)).toBe(true);
      expect(p.story.length).toBeGreaterThan(30);
      expect(p.people.length).toBeGreaterThan(0);
      expect(p.photos.length).toBeGreaterThanOrEqual(2);
      expect(p.photos.length).toBeLessThanOrEqual(FREE_PHOTO_LIMIT);
      for (const photo of p.photos) {
        expect(photo.kind).toBe('art');
        if (photo.kind === 'art') expect(SCENES).toContain(photo.scene);
      }
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lng)).toBeLessThanOrEqual(180);
    }
    expect(photoFiles(full)).toEqual([]);
  });
  test('no two pins are on the same spot', () => {
    const seen = new Set<string>();
    for (const p of full.places) {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
  test('it is a spread: several countries and kinds, with favorites', () => {
    const t = tally(full);
    expect(t.countries).toBeGreaterThanOrEqual(4);
    expect(new Set(full.places.map((p) => p.category)).size).toBeGreaterThanOrEqual(8);
    expect(full.places.some((p) => p.favorite)).toBe(true);
    expect(full.places.some((p) => p.until !== null)).toBe(true);
  });
});

test('every kind of place has its ink and its symbols', () => {
  for (const k of CATEGORIES) {
    expect(CATEGORY_INFO[k].key).toBe(k);
    expect(CATEGORY_INFO[k].color).toMatch(/^#[0-9A-F]{6}$/);
    expect(CATEGORY_INFO[k].sf).not.toBe('');
    expect(CATEGORY_INFO[k].web).not.toBe('');
  }
});
