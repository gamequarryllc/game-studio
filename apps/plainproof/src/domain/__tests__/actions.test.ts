import {
  addItem,
  addRoom,
  addRooms,
  deleteItem,
  deleteRoom,
  draftFromItem,
  draftProblems,
  emptyDraft,
  iconForRoomName,
  markBackup,
  moveRoom,
  renameRoom,
  setCurrency,
  updateItem,
  updateProfile,
} from '../actions';
import { emptyDoc } from '../doc';
import { FREE_ITEM_LIMIT, canAddItem, freeItemsLeft } from '../limits';
import { heavyHome, sampleHome } from '../sample';
import { backupState, findItems, homeSummary, itemSubtitle, itemTotalCents, needsSerial, plural, roomSummaries } from '../selectors';
import { LIMITS } from '../types';

const NOW = 1_800_000_000_000;

function twoRooms() {
  return addRooms(emptyDoc(NOW), [{ name: 'Kitchen', icon: 'kitchen' }, { name: 'Garage', icon: 'garage' }], NOW);
}

function withItem(name: string, patch: Partial<ReturnType<typeof emptyDraft>> = {}, doc = twoRooms()) {
  const draft = { ...emptyDraft(doc.rooms[0].id), name, ...patch };
  return addItem(doc, draft, NOW);
}

describe('rooms', () => {
  it('adds rooms and keeps their names distinct', () => {
    let doc = twoRooms();
    doc = addRoom(doc, 'kitchen', NOW).doc;
    doc = addRoom(doc, 'Kitchen', NOW).doc;
    expect(doc.rooms.map((r) => r.name)).toEqual(['Kitchen', 'Garage', 'kitchen 2', 'Kitchen 3']);
  });

  it('ignores an empty name', () => {
    const doc = twoRooms();
    expect(addRoom(doc, '   ', NOW)).toEqual({ doc, roomId: null });
    expect(renameRoom(doc, doc.rooms[0].id, '')).toBe(doc);
  });

  it('stops at the room limit', () => {
    const many = Array.from({ length: LIMITS.rooms + 10 }, (_, i) => ({ name: `Room ${i}`, icon: 'box' as const }));
    expect(addRooms(emptyDoc(NOW), many, NOW).rooms).toHaveLength(LIMITS.rooms);
  });

  it('renames without colliding with itself', () => {
    const doc = twoRooms();
    expect(renameRoom(doc, doc.rooms[0].id, 'Kitchen').rooms[0].name).toBe('Kitchen');
    expect(renameRoom(doc, doc.rooms[0].id, 'Garage').rooms[0].name).toBe('Garage 2');
  });

  it('reorders', () => {
    const doc = twoRooms();
    expect(moveRoom(doc, doc.rooms[1].id, -1).rooms.map((r) => r.name)).toEqual(['Garage', 'Kitchen']);
    expect(moveRoom(doc, doc.rooms[0].id, -1)).toBe(doc);
    expect(moveRoom(doc, doc.rooms[1].id, 1)).toBe(doc);
  });

  it('guesses an icon from the name', () => {
    expect(iconForRoomName('Guest bedroom')).toBe('bed');
    expect(iconForRoomName('Back yard')).toBe('outdoor');
    expect(iconForRoomName('The void')).toBe('box');
  });

  it('deleting a room moves its items when told where', () => {
    const { doc } = withItem('Toaster');
    const next = deleteRoom(doc, doc.rooms[0].id, doc.rooms[1].id, NOW + 5);
    expect(next.rooms.map((r) => r.name)).toEqual(['Garage']);
    expect(next.items).toHaveLength(1);
    expect(next.items[0].roomId).toBe(doc.rooms[1].id);
    expect(next.items[0].updatedAt).toBe(NOW + 5);
  });

  it('deleting a room with nowhere to move items deletes them too', () => {
    const { doc } = withItem('Toaster');
    expect(deleteRoom(doc, doc.rooms[0].id, null, NOW).items).toHaveLength(0);
    // A target that is the room itself, or that doesn't exist, counts as nowhere.
    expect(deleteRoom(doc, doc.rooms[0].id, doc.rooms[0].id, NOW).items).toHaveLength(0);
    expect(deleteRoom(doc, doc.rooms[0].id, 'missing00', NOW).items).toHaveLength(0);
  });
});

describe('items', () => {
  it('needs a name and a real room', () => {
    const doc = twoRooms();
    expect(draftProblems(doc, emptyDraft(doc.rooms[0].id))).toEqual(['name']);
    expect(draftProblems(doc, { ...emptyDraft('gone0000'), name: 'X' })).toEqual(['room']);
    expect(addItem(doc, emptyDraft(doc.rooms[0].id), NOW)).toEqual({ doc, itemId: null });
  });

  it('cleans what it is given', () => {
    const { doc, itemId } = withItem('  Drill  ', { quantity: 0, valueCents: -5, serial: ' SN 1 ', purchaseDate: '2020-99-99' });
    const item = doc.items.find((i) => i.id === itemId)!;
    expect(item).toMatchObject({ name: 'Drill', quantity: 1, valueCents: null, serial: 'SN 1', purchaseDate: null });
  });

  it('caps a long name, a huge quantity and a huge value', () => {
    const { doc } = withItem('x'.repeat(400), { quantity: 1e9, valueCents: 1e18 });
    expect(doc.items[0].name).toHaveLength(LIMITS.name);
    expect(doc.items[0].quantity).toBe(LIMITS.quantity);
    expect(doc.items[0].valueCents).toBe(LIMITS.cents);
  });

  it('updates and deletes', () => {
    const { doc, itemId } = withItem('Drill', { valueCents: 1000 });
    const draft = { ...draftFromItem(doc.items[0]), name: 'Hammer drill', roomId: doc.rooms[1].id };
    const updated = updateItem(doc, itemId!, draft, NOW + 9);
    expect(updated.items[0]).toMatchObject({ name: 'Hammer drill', roomId: doc.rooms[1].id, updatedAt: NOW + 9, createdAt: NOW });
    expect(updateItem(doc, itemId!, { ...draft, name: '' }, NOW)).toBe(doc);
    expect(deleteItem(updated, itemId!).items).toHaveLength(0);
  });
});

describe('totals', () => {
  it('uses the value, else the price paid, times the quantity', () => {
    let { doc } = withItem('Plates', { quantity: 12, valueCents: 1800 });
    doc = withItem('Mixer', { pricePaidCents: 44900 }, doc).doc;
    doc = withItem('Mystery box', {}, doc).doc;
    expect(doc.items.map(itemTotalCents)).toEqual([21600, 44900, 0]);
    const summary = homeSummary(doc);
    expect(summary).toMatchObject({ count: 3, pieces: 14, totalCents: 66500, withValue: 2, withPhoto: 0 });
    expect(roomSummaries(doc).map((r) => [r.room.name, r.count, r.totalCents])).toEqual([
      ['Kitchen', 3, 66500],
      ['Garage', 0, 0],
    ]);
  });

  it('adds up a large household exactly', () => {
    const doc = heavyHome(NOW, 600);
    const byRooms = roomSummaries(doc).reduce((n, r) => n + r.totalCents, 0);
    expect(homeSummary(doc).totalCents).toBe(byRooms);
    expect(Number.isSafeInteger(byRooms)).toBe(true);
    expect(doc.items.length).toBeGreaterThan(600);
  });

  it('flags a missing serial only where one is expected', () => {
    let { doc } = withItem('Sofa', { category: 'furniture' });
    doc = withItem('Laptop', { category: 'electronics' }, doc).doc;
    doc = withItem('Camera', { category: 'electronics', serial: 'ABC' }, doc).doc;
    expect(doc.items.map(needsSerial)).toEqual([false, true, false]);
    expect(homeSummary(doc).missingSerial).toBe(1);
  });
});

describe('finding items', () => {
  const doc = sampleHome(NOW);

  it('searches every text field and the room name, ignoring case and accents', () => {
    expect(findItems(doc, { query: 'OLED' }).map((i) => i.name)).toEqual(
      expect.arrayContaining(['65-inch OLED television', 'Game console']),
    );
    expect(findItems(doc, { query: 'garage drill' }).map((i) => i.name)).toEqual(['Cordless drill and driver kit']);
    expect(findItems(doc, { query: 'zzzz' })).toEqual([]);
    expect(findItems(doc, { query: '   ' })).toHaveLength(doc.items.length);
  });

  it('filters and sorts', () => {
    expect(findItems(doc, { filter: 'no-photo' })).toHaveLength(doc.items.length);
    const noValue = findItems(doc, { filter: 'no-value' });
    expect(noValue.length).toBeGreaterThan(0);
    expect(noValue.every((i) => i.valueCents === null && i.pricePaidCents === null)).toBe(true);
    const byValue = findItems(doc, { sort: 'value' });
    expect(byValue[0].name).toBe('Engagement ring, 0.9 ct solitaire');
    const byName = findItems(doc, { sort: 'name' }).map((i) => i.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    const inRoom = findItems(doc, { roomId: doc.rooms[0].id });
    expect(inRoom.every((i) => i.roomId === doc.rooms[0].id)).toBe(true);
  });

  it('writes small labels', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(1234, 'item')).toBe('1,234 items');
    expect(itemSubtitle({ ...doc.items[0], brand: 'A', model: 'B', quantity: 3 })).toBe('A · B · 3 of them');
  });
});

describe('the free limit', () => {
  it('lets the free version hold exactly the limit', () => {
    let doc = twoRooms();
    for (let i = 0; i < FREE_ITEM_LIMIT - 1; i++) doc = withItem(`Thing ${i}`, {}, doc).doc;
    expect(canAddItem(doc.items.length, false)).toBe(true);
    expect(freeItemsLeft(doc.items.length, false)).toBe(1);
    doc = withItem('Last free thing', {}, doc).doc;
    expect(canAddItem(doc.items.length, false)).toBe(false);
    expect(freeItemsLeft(doc.items.length, false)).toBe(0);
    expect(canAddItem(doc.items.length, true)).toBe(true);
    expect(freeItemsLeft(doc.items.length, true)).toBeNull();
  });

  it('never goes negative when a restored inventory is already over the limit', () => {
    expect(freeItemsLeft(sampleHome(NOW).items.length, false)).toBe(0);
  });
});

describe('profile and settings', () => {
  it('cleans the profile and checks the currency', () => {
    let doc = updateProfile(twoRooms(), { ownerName: '  Sam  ', address: 'Line 1\nLine 2' });
    expect(doc.profile).toMatchObject({ ownerName: 'Sam', address: 'Line 1\nLine 2' });
    doc = setCurrency(doc, 'GBP');
    expect(doc.settings.currency).toBe('GBP');
    expect(setCurrency(doc, 'pounds')).toBe(doc);
    expect(markBackup(doc, 77).meta.lastBackupAt).toBe(77);
  });
});

describe('whether the backup is behind', () => {
  it('has nothing to say about an empty inventory', () => {
    expect(backupState(twoRooms())).toBe('none');
    expect(backupState(markBackup(twoRooms(), NOW))).toBe('none');
  });

  it('says never until the first backup, and current right after one', () => {
    const { doc } = withItem('Kettle');
    expect(backupState(doc)).toBe('never');
    expect(backupState(markBackup(doc, NOW))).toBe('current');
  });

  it('falls behind when something is added or changed, and not when something is deleted', () => {
    const first = withItem('Kettle');
    const kettle = first.doc.items[0];
    const backed = markBackup(first.doc, NOW + 10);
    const added = addItem(backed, { ...emptyDraft(backed.rooms[0].id), name: 'Toaster' }, NOW + 20);
    expect(backupState(added.doc)).toBe('behind');
    const edited = updateItem(backed, kettle.id, { ...draftFromItem(kettle), name: 'Electric kettle' }, NOW + 30);
    expect(backupState(edited)).toBe('behind');
    expect(backupState(deleteItem(markBackup(added.doc, NOW + 40), kettle.id))).toBe('current');
  });
});

describe('a room whose things have no value', () => {
  it('is told apart from a room worth nothing (it used to show "$0")', () => {
    let doc = twoRooms();
    const kitchen = doc.rooms[0].id;
    const garage = doc.rooms[1].id;
    const unvalued = emptyDraft(garage);
    unvalued.name = 'Bicycle';
    doc = addItem(doc, unvalued, NOW).doc;
    const priced = emptyDraft(kitchen);
    priced.name = 'Kettle';
    priced.pricePaidCents = 4500;
    doc = addItem(doc, priced, NOW).doc;
    const another = emptyDraft(kitchen);
    another.name = 'Whisk';
    doc = addItem(doc, another, NOW).doc;

    const rooms = roomSummaries(doc);
    expect(rooms.map((r) => [r.room.name, r.count, r.valued, r.totalCents])).toEqual([
      ['Kitchen', 2, 1, 4500],
      ['Garage', 1, 0, 0],
    ]);
    expect(rooms.reduce((n, r) => n + r.valued, 0)).toBe(homeSummary(doc).withValue);
  });
});
