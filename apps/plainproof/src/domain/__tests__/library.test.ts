import { addItem, addRooms, emptyDraft, updateProfile } from '../actions';
import { DocError, emptyDoc, serializeDoc } from '../doc';
import {
  FREE_PLACE_LIMIT,
  MAX_PLACES,
  addPlace,
  canAddPlace,
  currentDoc,
  currentPlace,
  libraryOf,
  libraryPhotoIds,
  mapDocs,
  parseLibraryText,
  placeName,
  placeSummaries,
  removePlace,
  renamePlace,
  serializeLibrary,
  setCurrentDoc,
  setPlaceKind,
  switchPlace,
  totalItems,
} from '../library';
import { canAddItem } from '../limits';
import type { Doc } from '../types';

const NOW = new Date(2026, 10, 11, 10, 30).getTime();

function home(): Doc {
  let doc = addRooms(emptyDoc(NOW, 'EUR'), [{ name: 'Kitchen', icon: 'kitchen' }], NOW);
  doc = updateProfile(doc, { homeName: 'Fern Cottage', ownerName: 'Sam Example' });
  const draft = emptyDraft(doc.rooms[0].id);
  draft.name = 'Mixer';
  draft.valueCents = 44900;
  draft.photos = [{ id: 'photo0001', width: 4, height: 3 }];
  return addItem(doc, draft, NOW).doc;
}

function withThing(doc: Doc, name: string, cents: number, photo?: string): Doc {
  const draft = emptyDraft(doc.rooms[0].id);
  draft.name = name;
  draft.valueCents = cents;
  if (photo) draft.photos = [{ id: photo, width: 4, height: 3 }];
  return addItem(doc, draft, NOW).doc;
}

describe('places', () => {
  it('starts as one home, and every screen sees that home', () => {
    const lib = libraryOf(home());
    expect(lib.places).toHaveLength(1);
    expect(currentPlace(lib).kind).toBe('home');
    expect(currentDoc(lib).items[0].name).toBe('Mixer');
    expect(placeName(currentPlace(lib))).toBe('Fern Cottage');
    expect(placeName(currentPlace(libraryOf(emptyDoc(NOW))))).toBe('Household');
  });

  it('adds a place with starter rooms, the same currency and owner, and switches to it', () => {
    const lib = libraryOf(home());
    const { library, placeId } = addPlace(lib, '  Lake cabin  ', 'rental', NOW);
    expect(placeId).not.toBeNull();
    expect(library.places).toHaveLength(2);
    expect(library.currentId).toBe(placeId);
    const cabin = currentDoc(library);
    expect(cabin.profile.homeName).toBe('Lake cabin');
    expect(cabin.profile.ownerName).toBe('Sam Example');
    expect(cabin.settings.currency).toBe('EUR');
    expect(cabin.meta.onboarded).toBe(true);
    expect(cabin.rooms.map((r) => r.name)).toEqual(['Living room', 'Kitchen', 'Bedroom', 'Bathroom']);
    expect(cabin.items).toHaveLength(0);
    expect(currentDoc(addPlace(lib, 'Shop', 'office', NOW).library).rooms.map((r) => r.name)).toEqual(['Office', 'Front desk', 'Storage room']);
    expect(currentDoc(addPlace(lib, 'Unit 12', 'storage', NOW).library).rooms).toHaveLength(1);
    // The first place is untouched.
    expect(library.places[0].doc).toBe(lib.places[0].doc);
  });

  it('refuses a place with no name, and stops at the most it holds', () => {
    let lib = libraryOf(home());
    expect(addPlace(lib, '   ', 'home', NOW).placeId).toBeNull();
    for (let i = 1; i < MAX_PLACES; i++) lib = addPlace(lib, `Place ${i}`, 'other', NOW).library;
    expect(lib.places).toHaveLength(MAX_PLACES);
    expect(addPlace(lib, 'One too many', 'other', NOW).placeId).toBeNull();
    expect(canAddPlace(lib, true)).toBe(false);
  });

  it('keeps each place to itself: a change in one never shows in another', () => {
    const lib = libraryOf(home());
    const first = lib.currentId;
    let two = addPlace(lib, 'Lake cabin', 'rental', NOW).library;
    two = setCurrentDoc(two, withThing(currentDoc(two), 'Canoe', 90000));
    expect(currentDoc(two).items.map((i) => i.name)).toEqual(['Canoe']);
    const back = switchPlace(two, first);
    expect(currentDoc(back).items.map((i) => i.name)).toEqual(['Mixer']);
    expect(totalItems(back)).toBe(2);
    expect(switchPlace(back, 'nosuchplace')).toBe(back);
    expect(setCurrentDoc(back, currentDoc(back))).toBe(back);
  });

  it('sums each place for the cabinets view', () => {
    const lib = libraryOf(home());
    let two = addPlace(lib, 'Lake cabin', 'rental', NOW).library;
    two = setCurrentDoc(two, withThing(withThing(currentDoc(two), 'Canoe', 90000), 'Stove', 10000));
    const sums = placeSummaries(two);
    expect(sums.map((s) => [s.name, s.kind, s.count, s.totalCents, s.current])).toEqual([
      ['Fern Cottage', 'home', 1, 44900, false],
      ['Lake cabin', 'rental', 2, 100000, true],
    ]);
  });

  it('renames, changes the kind, and removes a place but never the last one', () => {
    const lib = libraryOf(home());
    const first = lib.currentId;
    const { library: two, placeId } = addPlace(lib, 'Lake cabin', 'rental', NOW);
    const renamed = setPlaceKind(renamePlace(two, placeId!, ' The cabin '), placeId!, 'other');
    expect(placeName(currentPlace(renamed))).toBe('The cabin');
    expect(currentPlace(renamed).kind).toBe('other');
    expect(renamePlace(two, placeId!, '  ')).toBe(two);
    // Removing the place being looked at falls back to the first one.
    const one = removePlace(renamed, placeId!);
    expect(one.places).toHaveLength(1);
    expect(one.currentId).toBe(first);
    expect(removePlace(one, first)).toBe(one);
  });

  it('counts the free limits across every place', () => {
    const lib = libraryOf(home());
    expect(FREE_PLACE_LIMIT).toBe(1);
    expect(canAddPlace(lib, false)).toBe(false);
    expect(canAddPlace(lib, true)).toBe(true);
    let two = addPlace(lib, 'Lake cabin', 'rental', NOW).library;
    let cabin = currentDoc(two);
    for (let i = 0; i < 19; i++) cabin = withThing(cabin, `Thing ${i}`, 100);
    two = setCurrentDoc(two, cabin);
    // 1 in the cottage and 19 in the cabin make 20: the free version is full, whichever place is open.
    expect(totalItems(two)).toBe(20);
    expect(canAddItem(totalItems(two), false)).toBe(false);
    expect(canAddItem(totalItems(two), true)).toBe(true);
  });

  it('knows every photo any place uses, and can change every place at once', () => {
    const lib = libraryOf(home());
    let two = addPlace(lib, 'Lake cabin', 'rental', NOW).library;
    two = setCurrentDoc(two, withThing(currentDoc(two), 'Canoe', 90000, 'cabinphoto1'));
    expect([...libraryPhotoIds(two)].sort()).toEqual(['cabinphoto1', 'photo0001']);
    const usd = mapDocs(two, (d) => ({ ...d, settings: { ...d.settings, currency: 'USD' } }));
    expect(usd.places.map((p) => p.doc.settings.currency)).toEqual(['USD', 'USD']);
  });
});

describe('saving and loading places', () => {
  it('round-trips', () => {
    const lib = libraryOf(home());
    const two = addPlace(lib, 'Lake cabin', 'rental', NOW).library;
    const back = parseLibraryText(serializeLibrary(two), NOW);
    expect(back.currentId).toBe(two.currentId);
    expect(back.places.map((p) => [p.id, p.kind, p.doc.profile.homeName])).toEqual(two.places.map((p) => [p.id, p.kind, p.doc.profile.homeName]));
    expect(back.places[0].doc.items[0].name).toBe('Mixer');
  });

  it('opens a file saved before places existed as one home, with nothing lost', () => {
    const before = home();
    const lib = parseLibraryText(serializeDoc(before), NOW);
    expect(lib.places).toHaveLength(1);
    expect(currentPlace(lib).kind).toBe('home');
    expect(currentDoc(lib).items.map((i) => i.name)).toEqual(['Mixer']);
    expect(currentDoc(lib).profile.homeName).toBe('Fern Cottage');
    expect(currentDoc(lib).settings.currency).toBe('EUR');
  });

  it('repairs what it can: a bad kind, a repeated id, a current place that is gone, a broken entry', () => {
    const doc = home();
    const text = JSON.stringify({
      format: 'plainproof-library',
      version: 2,
      currentId: 'gone0000',
      places: [
        { id: 'same0001', kind: 'castle', doc },
        { id: 'same0001', kind: 'office', doc },
        { id: '../../etc', kind: 'home', doc },
        { id: 'broken01', kind: 'home', doc: 'not a document' },
        'nonsense',
      ],
    });
    const lib = parseLibraryText(text, NOW);
    expect(lib.places).toHaveLength(3);
    expect(lib.places[0]).toMatchObject({ id: 'same0001', kind: 'home' });
    expect(lib.places[1].kind).toBe('office');
    expect(new Set(lib.places.map((p) => p.id)).size).toBe(3);
    expect(lib.places.every((p) => /^[0-9a-z_-]{4,40}$/.test(p.id))).toBe(true);
    expect(lib.currentId).toBe('same0001');
  });

  it('refuses what it cannot read, and anything from a newer version', () => {
    expect(() => parseLibraryText('{', NOW)).toThrow(DocError);
    expect(() => parseLibraryText(JSON.stringify({ format: 'plainproof-library', version: 2, places: [] }), NOW)).toThrow(DocError);
    expect(() => parseLibraryText(JSON.stringify({ format: 'plainproof-library', version: 3, places: [{ id: 'aaaa1111', kind: 'home', doc: home() }] }), NOW)).toThrow(/newer version/);
    const newer = { ...home(), version: 99 };
    expect(() => parseLibraryText(JSON.stringify({ format: 'plainproof-library', version: 2, places: [{ id: 'aaaa1111', kind: 'home', doc: newer }] }), NOW)).toThrow(/newer version/);
  });
});
