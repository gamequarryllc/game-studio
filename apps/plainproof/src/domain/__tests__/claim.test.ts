import { addItem, addRooms, deleteItem, draftProblems, emptyDraft, isFutureYmd, markBackup, renameRoom, updateProfile } from '../actions';
import { codeCell, buildCsv } from '../csv';
import { displayDateTime, parseExifDate, utcOffsetLabel } from '../dates';
import { emptyDoc, parseDoc } from '../doc';
import { addPlace, libraryOf, setCurrentDoc, stampChanges } from '../library';
import { buildReportHtml, documentedLine, inventoryReference, reportFileName, reportPhotoIds, valueBasisSentence } from '../report';
import { backupState, homeSummary } from '../selectors';
import { sha256Hex } from '../sha256';
import type { Doc } from '../types';

// The changes that make the report something to hand an insurer: which value
// each line uses, what is missing from the total, when things were recorded and
// photographed, and a reference that tells one report from another.

const NOW = new Date(2026, 10, 15, 9, 5).getTime();
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
const TAKEN = new Date(2021, 2, 4, 14, 22).getTime();

function home(): Doc {
  let doc = addRooms(emptyDoc(NOW), [{ name: 'Living room', icon: 'sofa' }, { name: 'Empty', icon: 'box' }], NOW);
  doc = updateProfile(doc, { homeName: 'Café Rose', ownerName: 'Owner' });
  const room = doc.rooms[0].id;
  const tv = { ...emptyDraft(room), name: 'Television', valueCents: 189900, pricePaidCents: 179999, condition: 'good' as const };
  tv.photos = [
    { id: 'tvphoto01', width: 4, height: 3, takenAt: TAKEN, addedAt: NOW },
    { id: 'tvphoto02', width: 4, height: 3, takenAt: null, addedAt: NOW },
  ];
  doc = addItem(doc, tv, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(room), name: 'Sofa', pricePaidCents: 120000 }, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(room), name: 'Laptop' }, NOW).doc;
  return doc;
}

describe('which value the report uses', () => {
  const doc = home();
  const html = buildReportHtml(doc, { includePhotos: true, includeReceipts: true, generatedAt: NOW, appVersion: '1.0.1', photoData: { tvphoto01: PIXEL } });

  it('says how the total was reached and what is missing from it', () => {
    const basis = valueBasisSentence(doc);
    expect(basis.missing).toBe(1);
    expect(basis.text).toBe(
      'The total counts 1 item at replacement value, and 1 item at the price paid, where no replacement value was given. 1 item has no value and is not in the total.',
    );
    expect(html).toContain('<b>1 item has no value and is not in the total.</b>');
  });

  it('shows the replacement value on its own and marks a total that fell back to the price paid', () => {
    expect(html).toContain('Replace each');
    expect(html).toContain('$1,200.00<div class="basis">at price paid</div>');
    expect(html).toContain('Paid $1,799.99');
    expect(html).toContain('Condition: Good');
  });

  it('flags unvalued items on the room line too', () => {
    expect(html).toContain('3 items · $3,099.00 · 1 without a value · Café Rose, ref ');
  });
});

describe('dates and provenance', () => {
  it('records when an item went in and when its earliest photo was taken', () => {
    const tv = home().items[0];
    expect(documentedLine(tv)).toBe('Recorded Nov 15, 2026 · photo taken Mar 4, 2021');
  });

  it('prints the time, the offset, the app version and the reference', () => {
    const doc = home();
    const html = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW, appVersion: '1.0.1' });
    expect(displayDateTime(NOW)).toMatch(/^Nov 15, 2026, 9:05 AM \(UTC[+−]\d{2}:\d{2}\)$/);
    expect(html).toContain(displayDateTime(NOW));
    expect(html).toContain(`${inventoryReference(doc)} <span class="muted">· Plainproof 1.0.1</span>`);
  });

  it('labels the offset with a real minus sign', () => {
    expect(utcOffsetLabel(NOW)).toMatch(/^UTC[+−]\d{2}:\d{2}$/);
  });

  it('reads the date taken from EXIF, with or without an offset', () => {
    expect(parseExifDate('2021:03:04 14:22:05', undefined, NOW)).toBe(new Date(2021, 2, 4, 14, 22, 5).getTime());
    expect(parseExifDate('2021:03:04 14:22:05', '+01:00', NOW)).toBe(Date.UTC(2021, 2, 4, 13, 22, 5));
    expect(parseExifDate('2021:02:30 10:00:00', undefined, NOW)).toBeNull();
    expect(parseExifDate('0000:00:00 00:00:00', undefined, NOW)).toBeNull();
    expect(parseExifDate('2031:01:01 00:00:00', undefined, NOW)).toBeNull();
    expect(parseExifDate(42, undefined, NOW)).toBeNull();
  });

  it('keeps photo dates through a save and a restore, and repairs bad ones', () => {
    const doc = home();
    const round = parseDoc(JSON.parse(JSON.stringify(doc)), NOW);
    expect(round.items[0].photos[0]).toEqual({ id: 'tvphoto01', width: 4, height: 3, takenAt: TAKEN, addedAt: NOW });
    const raw = JSON.parse(JSON.stringify(doc));
    raw.items[0].photos[0].takenAt = 'yesterday';
    raw.items[0].condition = 'mint';
    const repaired = parseDoc(raw, NOW);
    expect(repaired.items[0].photos[0].takenAt).toBeNull();
    expect(repaired.items[0].condition).toBeNull();
  });
});

describe('every photo, full size', () => {
  it('adds an appendix with each photo and its dates only when asked', () => {
    const doc = home();
    const photoData = { tvphoto01: PIXEL, tvphoto02: PIXEL };
    const without = buildReportHtml(doc, { includePhotos: true, includeReceipts: true, generatedAt: NOW, photoData });
    expect(without).not.toContain('class="photos"');
    const withAll = buildReportHtml(doc, { includePhotos: true, includeReceipts: true, includeAllPhotos: true, generatedAt: NOW, photoData });
    expect(withAll).toContain('<h2 class="serif">Photos</h2>');
    expect(withAll).toContain('Photo 1 of 2 · taken Mar 4, 2021 · added Nov 15, 2026');
    expect(withAll).toContain('Photo 2 of 2 · added Nov 15, 2026');
    expect(reportPhotoIds(doc, { includePhotos: true, includeReceipts: false, includeAllPhotos: true }).full).toEqual(['tvphoto01', 'tvphoto02']);
  });
});

describe('the report reference', () => {
  it('is stable for the same data and changes with any edit', () => {
    const doc = home();
    expect(inventoryReference(doc)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(inventoryReference(parseDoc(JSON.parse(JSON.stringify(doc)), NOW))).toBe(inventoryReference(doc));
    expect(inventoryReference(updateProfile(doc, { policyNumber: 'P-2' }))).not.toBe(inventoryReference(doc));
    expect(inventoryReference(deleteItem(doc, doc.items[2].id))).not.toBe(inventoryReference(doc));
  });

  it('uses a correct SHA-256', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('é'.repeat(100))).toHaveLength(64);
  });
});

describe('the spreadsheet keeps codes as written', () => {
  it('protects serials that a spreadsheet would mangle', () => {
    expect(codeCell('0012345678')).toBe('"=""0012345678"""');
    expect(codeCell('356938035643809')).toBe('"=""356938035643809"""');
    expect(codeCell('3-4')).toBe('"=""3-4"""');
    expect(codeCell('NV65A2X0418K')).toBe('NV65A2X0418K');
    expect(codeCell('')).toBe('');
  });

  it('writes the value basis and when each item was recorded', () => {
    const csv = buildCsv(home());
    expect(csv).toContain('Replacement value each,Price paid each,Value each,Total value,Value basis');
    expect(csv).toContain('Living room,Sofa,,,1,,,,,1200.00,1200.00,1200.00,Price paid,');
    expect(csv).toContain('Living room,Television,,Good,1,,,,1899.00,1799.99,1899.00,1899.00,Replacement value,');
    expect(csv).toContain(',2026-11-15,2021-03-04,');
  });
});

describe('purchase dates', () => {
  it('refuses a date after today', () => {
    const doc = home();
    expect(isFutureYmd('2026-11-16', NOW)).toBe(true);
    expect(isFutureYmd('2026-11-15', NOW)).toBe(false);
    const draft = { ...emptyDraft(doc.rooms[0].id), name: 'Phone', purchaseDate: '2030-01-01' };
    expect(draftProblems(doc, draft, NOW)).toEqual(['future-date']);
    expect(addItem(doc, draft, NOW).itemId).toBeNull();
  });
});

describe('the backup reminder', () => {
  function stamped(before: Doc, after: Doc, at: number): Doc {
    const lib = libraryOf(before);
    return stampChanges(lib, setCurrentDoc(lib, after), at).places[0].doc;
  }

  it('notices a deleted item, a renamed room and a new policy number, not only edited items', () => {
    const backedUp = markBackup(home(), NOW);
    expect(backupState(backedUp)).toBe('current');
    const later = NOW + 60_000;
    expect(backupState(stamped(backedUp, deleteItem(backedUp, backedUp.items[1].id), later))).toBe('behind');
    expect(backupState(stamped(backedUp, renameRoom(backedUp, backedUp.rooms[0].id, 'Lounge'), later))).toBe('behind');
    expect(backupState(stamped(backedUp, updateProfile(backedUp, { policyNumber: 'HO-2' }), later))).toBe('behind');
  });

  it('does not count making a backup or a report as a change', () => {
    const doc = home();
    expect(stamped(doc, markBackup(doc, NOW), NOW + 1).meta.modifiedAt).toBeNull();
  });

  it('marks every place when a place is added', () => {
    const lib = libraryOf(home());
    const { library } = addPlace(lib, 'Storage unit', 'storage', NOW);
    const next = stampChanges(lib, library, NOW + 5);
    expect(next.places.every((p) => p.doc.meta.modifiedAt === NOW + 5)).toBe(true);
  });
});

describe('small things', () => {
  it('folds accents in file names instead of dropping the letter', () => {
    expect(reportFileName(home(), NOW)).toBe('Cafe-Rose-2026-11-15');
  });

  it('counts only rooms with something in them', () => {
    const s = homeSummary(home());
    expect(s.rooms).toBe(2);
    expect(s.filledRooms).toBe(1);
  });
});
