import { addItem, addRooms, emptyDraft } from '../actions';
import { displayYmd, fromYmd, isValidYmd, relativeDay, toYmd } from '../dates';
import { DocError, cleanText, emptyDoc, parseDoc, parseDocText, photoIdsInUse, serializeDoc } from '../doc';
import { isSafeId, newId } from '../ids';
import { LIMITS } from '../types';

const NOW = Date.UTC(2026, 10, 11, 12);

function home() {
  let doc = addRooms(emptyDoc(NOW), [{ name: 'Kitchen', icon: 'kitchen' }, { name: 'Garage', icon: 'garage' }], NOW);
  const draft = emptyDraft(doc.rooms[0].id);
  draft.name = 'Toaster';
  draft.valueCents = 4500;
  draft.photos = [{ id: 'photoaaaa', width: 400, height: 300 }];
  draft.receipts = [{ id: 'receiptaa', width: 300, height: 600 }];
  doc = addItem(doc, draft, NOW).doc;
  return doc;
}

describe('ids', () => {
  it('makes safe, distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isSafeId(id)).toBe(true);
  });

  it('refuses anything that could escape a folder', () => {
    for (const bad of ['../x', 'a/b', 'a\\b', '', 'A B', 'x'.repeat(41), 5, null, 'ab.jpg']) {
      expect(isSafeId(bad)).toBe(false);
    }
  });
});

describe('parseDoc', () => {
  it('round-trips a real document unchanged', () => {
    const doc = home();
    expect(parseDocText(serializeDoc(doc), NOW)).toEqual({ ...doc, meta: { ...doc.meta, onboarded: true } });
  });

  it('refuses things that are not a document', () => {
    expect(() => parseDoc(null, NOW)).toThrow(DocError);
    expect(() => parseDoc([], NOW)).toThrow(DocError);
    expect(() => parseDoc({ rooms: 'x', items: [] }, NOW)).toThrow(DocError);
    expect(() => parseDocText('not json', NOW)).toThrow(DocError);
  });

  it('refuses a document from a newer version', () => {
    try {
      parseDoc({ version: 99, rooms: [], items: [] }, NOW);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as DocError).reason).toBe('too-new');
    }
  });

  it('repairs bad values instead of failing', () => {
    const doc = parseDoc(
      {
        version: 1,
        rooms: [{ id: 'room1111', name: '  Den  ', icon: 'spaceship' }, { id: '../evil', name: 'Bad id' }, { id: 'room2222', name: '' }],
        items: [
          {
            id: 'item1111',
            roomId: 'room1111',
            name: 'Lamp\u0000\u0007',
            quantity: -4,
            valueCents: 1e15,
            pricePaidCents: 'free',
            purchaseDate: '2021-02-30',
            category: 'spaceships',
            notes: 'line one\nline two',
            photos: [{ id: 'ok_photo1', width: 10, height: 10 }, { id: '../../etc/passwd' }, { id: 'ok_photo1' }],
          },
          { id: 'item2222', roomId: 'room1111', name: '   ' },
        ],
        settings: { currency: 'dollars' },
      },
      NOW,
    );
    expect(doc.rooms).toHaveLength(1);
    expect(doc.rooms[0]).toMatchObject({ name: 'Den', icon: 'box' });
    expect(doc.items).toHaveLength(1);
    const item = doc.items[0];
    expect(item.name).toBe('Lamp');
    expect(item.quantity).toBe(1);
    expect(item.valueCents).toBe(LIMITS.cents);
    expect(item.pricePaidCents).toBeNull();
    expect(item.purchaseDate).toBeNull();
    expect(item.category).toBeNull();
    expect(item.notes).toBe('line one\nline two');
    expect(item.photos).toEqual([{ id: 'ok_photo1', width: 10, height: 10 }]);
    expect(doc.settings.currency).toBe('USD');
  });

  it('keeps an item whose room has gone, in a room called Unsorted', () => {
    const doc = parseDoc(
      { version: 1, rooms: [], items: [{ id: 'item1111', roomId: 'nowhere1', name: 'Bike' }, { id: 'item2222', name: 'Helmet' }] },
      NOW,
    );
    expect(doc.rooms.map((r) => r.name)).toEqual(['Unsorted']);
    expect(doc.items.every((i) => i.roomId === doc.rooms[0].id)).toBe(true);
  });

  it('never lets two items share a photo file', () => {
    const doc = parseDoc(
      {
        version: 1,
        rooms: [{ id: 'room1111', name: 'Den' }],
        items: [
          { id: 'item1111', roomId: 'room1111', name: 'A', photos: [{ id: 'shared111' }] },
          { id: 'item2222', roomId: 'room1111', name: 'B', receipts: [{ id: 'shared111' }] },
        ],
      },
      NOW,
    );
    expect(doc.items[0].photos).toHaveLength(1);
    expect(doc.items[1].receipts).toHaveLength(0);
  });

  it('lists the photo files in use', () => {
    expect([...photoIdsInUse(home())].sort()).toEqual(['photoaaaa', 'receiptaa']);
  });
});

describe('cleanText', () => {
  it('trims, cuts and flattens', () => {
    expect(cleanText('  hi  ', 10)).toBe('hi');
    expect(cleanText('a\nb', 10)).toBe('a b');
    expect(cleanText('a\nb', 10, true)).toBe('a\nb');
    expect(cleanText('x'.repeat(500), 120)).toHaveLength(120);
    expect(cleanText(42, 10)).toBe('');
  });
});

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isValidYmd('2024-02-29')).toBe(true);
    expect(isValidYmd('2023-02-29')).toBe(false);
    expect(isValidYmd('2023-13-01')).toBe(false);
    expect(isValidYmd('2023-1-1')).toBe(false);
    expect(isValidYmd('1850-01-01')).toBe(false);
  });

  it('converts both ways without losing a day', () => {
    for (const ymd of ['2021-03-04', '2024-02-29', '2026-12-31', '2026-01-01']) {
      expect(toYmd(fromYmd(ymd))).toBe(ymd);
    }
  });

  it('writes dates for people', () => {
    expect(displayYmd('2021-03-04')).toBe('Mar 4, 2021');
    expect(displayYmd(null)).toBe('');
    expect(displayYmd('nonsense')).toBe('');
  });

  it('describes how long ago', () => {
    const now = new Date(2026, 10, 11, 9).getTime();
    expect(relativeDay(now - 3_600_000, now)).toBe('today');
    expect(relativeDay(new Date(2026, 10, 10, 23).getTime(), now)).toBe('yesterday');
    expect(relativeDay(new Date(2026, 10, 1, 12).getTime(), now)).toBe('10 days ago');
    expect(relativeDay(new Date(2026, 5, 1, 12).getTime(), now)).toBe('on Jun 1, 2026');
  });
});
