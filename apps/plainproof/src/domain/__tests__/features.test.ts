import {
  addClaim,
  addItem,
  addPolicyDocuments,
  addRoomVideo,
  addRooms,
  claimedItems,
  claimsOf,
  deleteItem,
  deleteRoom,
  emptyDraft,
  removeClaim,
  removePolicyDocument,
  setClaimItem,
  setReminders,
  updateClaim,
  updatePolicy,
} from '../actions';
import { buildCsv } from '../csv';
import { OFTEN_LIMITED, coverage } from '../coverage';
import { emptyDoc, filesInUse, parseDoc } from '../doc';
import { libraryOf, setCurrentDoc, stampChanges } from '../library';
import { planReminders } from '../reminders';
import { buildReportHtml, reportFileName } from '../report';
import { readReceipt, serialCandidates } from '../scan';
import { backupState, claimSummary, claimTitle, needsSerial } from '../selectors';
import { CATEGORY_LABELS, LIMITS, type Doc } from '../types';

const NOW = new Date(2026, 10, 15, 9, 0).getTime();
const DAY = 86_400_000;

function home(): Doc {
  let doc = addRooms(emptyDoc(NOW), [{ name: 'Living room', icon: 'sofa' }, { name: 'Bedroom', icon: 'bed' }], NOW);
  const [lr, bed] = doc.rooms.map((r) => r.id);
  doc = addItem(doc, { ...emptyDraft(lr), name: 'Television', category: 'electronics', valueCents: 150000, warrantyUntil: '2027-01-10' }, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(lr), name: 'Laptop', category: 'electronics', valueCents: 200000 }, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(bed), name: 'Engagement ring', category: 'jewelry', valueCents: 600000 }, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(bed), name: 'Watch', category: 'jewelry', valueCents: 90000 }, NOW).doc;
  return doc;
}

describe('claim mode', () => {
  /** A home with one claim open: the ring stolen (with a note) and the laptop stolen. */
  function withClaim(): Doc {
    let doc = addClaim(home(), 'claim1', NOW);
    doc = setClaimItem(doc, 'claim1', doc.items[2].id, 'stolen', 'Taken from the dresser');
    return setClaimItem(doc, 'claim1', doc.items[1].id, 'stolen');
  }

  it('adds items to a claim, changes and removes them, and ends the claim without touching the items', () => {
    let doc = withClaim();
    expect(doc.claims).toHaveLength(1);
    expect(doc.claims[0].openedAt).toBe(NOW);
    expect(claimedItems(doc, 'claim1').map((i) => [i.name, i.loss, i.lossNote])).toEqual([
      ['Laptop', 'stolen', ''],
      ['Engagement ring', 'stolen', 'Taken from the dresser'],
    ]);
    // Changing the status keeps the note unless a new one is given.
    doc = setClaimItem(doc, 'claim1', doc.items[2].id, 'lost');
    expect(claimedItems(doc, 'claim1')[1]).toMatchObject({ loss: 'lost', lossNote: 'Taken from the dresser' });
    doc = setClaimItem(doc, 'claim1', doc.items[1].id, null);
    expect(claimedItems(doc, 'claim1').map((i) => i.name)).toEqual(['Engagement ring']);
    const ended = removeClaim(doc, 'claim1');
    expect(ended.claims).toEqual([]);
    expect(ended.items).toEqual(doc.items);
    // Nothing happens for a claim or an item that isn't there.
    expect(setClaimItem(doc, 'nope', doc.items[0].id, 'stolen')).toBe(doc);
    expect(setClaimItem(doc, 'claim1', 'nope', 'stolen')).toBe(doc);
  });

  it('keeps several claims apart: their own items, totals and schedules', () => {
    let doc = withClaim();
    doc = addClaim(doc, 'claim2', NOW + 1);
    doc = setClaimItem(doc, 'claim2', doc.items[0].id, 'damaged', 'Water through the ceiling');
    // The same thing can be in two claims: damaged in one loss, stolen in another.
    doc = setClaimItem(doc, 'claim2', doc.items[1].id, 'damaged');
    doc = updateClaim(doc, 'claim2', { name: 'Burst pipe', claimNumber: 'W-77' }, NOW);
    expect(claimedItems(doc, 'claim2').map((i) => i.name)).toEqual(['Television', 'Laptop']);
    expect(claimSummary(doc, doc.claims[0])).toMatchObject({ count: 2, totalCents: 800000, byStatus: { stolen: 2 } });
    expect(claimSummary(doc, doc.claims[1])).toMatchObject({ count: 2, totalCents: 350000, byStatus: { damaged: 2 } });
    expect(claimsOf(doc, doc.items[1].id).map(({ claim, entry }) => [claim.id, entry.loss])).toEqual([
      ['claim1', 'stolen'],
      ['claim2', 'damaged'],
    ]);
    const second = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW, claimId: 'claim2' });
    expect(second).toContain('Burst pipe');
    expect(second).toContain('W-77');
    expect(second).toContain('Water through the ceiling');
    expect(second).not.toContain('Engagement ring');
    expect(second).not.toContain('Taken from the dresser');
    const first = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW, claimId: 'claim1' });
    expect(first).toContain('Engagement ring');
    expect(first).not.toContain('Television');
    expect(reportFileName(doc, NOW, doc.claims[1])).toBe('Home-inventory-claim-W-77-2026-11-15');
    // Ending one leaves the other as it was.
    const left = removeClaim(doc, 'claim1');
    expect(left.claims.map((c) => c.id)).toEqual(['claim2']);
    expect(claimedItems(left, 'claim2')).toHaveLength(2);
  });

  it('opens at most a dozen claims at once, and never two with one id', () => {
    let doc = home();
    for (let i = 0; i < LIMITS.claims + 3; i++) doc = addClaim(doc, `claim${i}`, NOW);
    expect(doc.claims).toHaveLength(LIMITS.claims);
    expect(addClaim(doc, 'claim0', NOW)).toBe(doc);
  });

  it('takes a deleted item, or a deleted room’s items, out of every claim', () => {
    let doc = withClaim();
    doc = addClaim(doc, 'claim2', NOW);
    doc = setClaimItem(doc, 'claim2', doc.items[2].id, 'damaged');
    doc = deleteItem(doc, doc.items[2].id);
    expect(doc.claims.map((c) => c.items.length)).toEqual([1, 0]);
    doc = deleteRoom(doc, doc.rooms[0].id, null, NOW);
    expect(doc.claims.map((c) => c.items.length)).toEqual([0, 0]);
    expect(doc.claims).toHaveLength(2);
  });

  it('names a claim by what the person called it, else what happened and when, else its number', () => {
    let doc = addClaim(home(), 'c', NOW);
    expect(claimTitle(doc.claims[0])).toBe('Claim started Nov 15, 2026');
    doc = updateClaim(doc, 'c', { claimNumber: 'CL-9' }, NOW);
    expect(claimTitle(doc.claims[0])).toBe('Claim CL-9');
    doc = updateClaim(doc, 'c', { cause: 'fire', lossDate: '2026-11-02' }, NOW);
    expect(claimTitle(doc.claims[0])).toBe('Fire, Nov 2, 2026');
    doc = updateClaim(doc, 'c', { name: '  Kitchen fire ' }, NOW);
    expect(claimTitle(doc.claims[0])).toBe('Kitchen fire');
  });

  it('keeps the claim details tidy and refuses a loss date in the future', () => {
    let doc = addClaim(home(), 'c', NOW);
    doc = updateClaim(doc, 'c', { claimNumber: '  CL-123 ', cause: 'theft', lossDate: '2026-11-12', description: 'Break-in\nthrough the back door' }, NOW);
    expect(doc.claims[0]).toEqual({ id: 'c', name: '', openedAt: NOW, lossDate: '2026-11-12', cause: 'theft', claimNumber: 'CL-123', description: 'Break-in\nthrough the back door', items: [] });
    expect(updateClaim(doc, 'c', { lossDate: '2027-01-01' }, NOW).claims[0].lossDate).toBeNull();
  });

  it('makes a claim schedule with only the claimed items and the claim on top', () => {
    let doc = home();
    doc = addClaim(doc, 'c', NOW);
    doc = setClaimItem(doc, 'c', doc.items[2].id, 'stolen', 'Taken from the dresser');
    doc = updateClaim(doc, 'c', { claimNumber: 'CL-123', cause: 'theft', lossDate: '2026-11-12', description: 'Back door forced' }, NOW);
    doc = setClaimItem(doc, 'c', doc.items[0].id, 'damaged', 'Pushed off the stand');
    doc = updatePolicy(doc, { deductibleCents: 50000 });
    const html = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW, claimId: 'c' });
    expect(html).toContain('Insurance claim · schedule of loss');
    expect(html).toContain('CL-123');
    expect(html).toContain('Nov 12, 2026');
    expect(html).toContain('Theft or break-in');
    expect(html).toContain('Back door forced');
    expect(html).toContain('$500.00');
    expect(html).toContain('Value claimed');
    expect(html).toContain('$7,500.00');
    expect(html).toContain('1 stolen · 1 damaged');
    expect(html).toContain('<div class="loss">Stolen</div>');
    expect(html).toContain('<b>What happened:</b> Taken from the dresser');
    expect(html).not.toContain('Laptop');
    expect(reportFileName(doc, NOW, doc.claims[0])).toBe('Home-inventory-claim-CL-123-2026-11-15');
    expect(reportFileName(doc, NOW, { ...doc.claims[0], claimNumber: '', name: '' })).toBe('Home-inventory-claim-2026-11-15');
    // The inventory report carries no claim marks.
    expect(buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW })).not.toContain('class="loss"');
  });

  it('writes a claim spreadsheet with the loss in front', () => {
    let doc = addClaim(home(), 'c', NOW);
    doc = setClaimItem(doc, 'c', doc.items[2].id, 'stolen', 'From the dresser, with "box"');
    const rows = buildCsv(doc, { claim: doc.claims[0] }).replace('\uFEFF', '').trimEnd().split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith('Loss,What happened,Room,Item')).toBe(true);
    expect(rows[1].startsWith('Stolen,"From the dresser, with ""box""",Bedroom,Engagement ring,"Jewelry, watches and furs"')).toBe(true);
    expect(buildCsv(doc).replace('\uFEFF', '').split('\r\n')[0].startsWith('Room,')).toBe(true);
  });

  it('survives a save and load, and repairs bad entries', () => {
    let doc = withClaim();
    doc = addClaim(doc, 'claim2', NOW);
    const raw = JSON.parse(JSON.stringify(doc));
    raw.claims[0].items.push({ itemId: raw.items[2].id, loss: 'damaged', note: 'twice' }); // a second entry for one item
    raw.claims[0].items.push({ itemId: 'gone', loss: 'stolen', note: '' }); // an item that isn't there
    raw.claims[0].items.push({ itemId: raw.items[3].id, loss: 'vaporised', note: '' }); // no such status
    raw.claims[1].id = 'claim1'; // the same id twice
    const back = parseDoc(raw, NOW);
    expect(back.claims[0]).toEqual(doc.claims[0]);
    expect(back.claims[1].id).not.toBe('claim1');
    expect(back.claims[1].items).toEqual([]);
  });

  it('brings back the single claim of the build before several claims, from a save or a backup', () => {
    const raw = JSON.parse(JSON.stringify(home()));
    delete raw.claims;
    raw.claim = { openedAt: NOW - DAY, lossDate: '2026-11-12', cause: 'theft', claimNumber: 'CL-1', description: 'Break-in' };
    raw.items[2].loss = 'stolen';
    raw.items[2].lossNote = 'From the dresser';
    raw.items[0].loss = 'nonsense';
    const back = parseDoc(raw, NOW);
    expect(back.claims).toHaveLength(1);
    expect(back.claims[0]).toMatchObject({ name: '', openedAt: NOW - DAY, lossDate: '2026-11-12', cause: 'theft', claimNumber: 'CL-1', description: 'Break-in' });
    expect(back.claims[0].items).toEqual([{ itemId: raw.items[2].id, loss: 'stolen', note: 'From the dresser' }]);
    expect(back.items[2]).not.toHaveProperty('loss');
    // Marked items with no claim record still make a claim; nothing marked and no claim makes none.
    delete raw.claim;
    expect(parseDoc(raw, NOW).claims[0].items).toHaveLength(1);
    delete raw.items[2].loss;
    expect(parseDoc(raw, NOW).claims).toEqual([]);
  });

  it('counts as a change for the backup', () => {
    const lib = libraryOf(home());
    const marked = setClaimItem(addClaim(lib.places[0].doc, 'c', NOW), 'c', lib.places[0].doc.items[0].id, 'stolen');
    const next = stampChanges(lib, setCurrentDoc(lib, { ...marked, meta: { ...marked.meta, lastBackupAt: NOW - 1 } }), NOW + 5);
    expect(backupState(next.places[0].doc)).toBe('behind');
  });
});

describe('the policy and coverage', () => {
  it('compares the inventory with the contents limit and the category limits', () => {
    let doc = updatePolicy(home(), { contentsLimitCents: 1_000_000, categoryLimits: { jewelry: 150000 } });
    const c = coverage(doc);
    expect(c.totalCents).toBe(1_040_000);
    expect(c.state).toBe('over');
    const jewelry = c.byCategory.find((x) => x.category === 'jewelry')!;
    expect(jewelry).toMatchObject({ count: 2, totalCents: 690000, limitCents: 150000, over: true });
    expect(c.toSchedule.map((i) => i.name)).toEqual(['Engagement ring']);
    doc = updatePolicy(doc, { contentsLimitCents: 1_250_000 });
    expect(coverage(doc).state).toBe('close');
    expect(coverage(updatePolicy(doc, { contentsLimitCents: null })).state).toBe('unknown');
  });

  it('flags valuable jewelry even with no limit typed in', () => {
    expect(coverage(home()).toSchedule.map((i) => i.name)).toEqual(['Engagement ring']);
  });

  it('uses the standard policy limits for the kinds insurers cap, and none for sports gear', () => {
    expect(OFTEN_LIMITED).toEqual(['jewelry', 'firearms', 'silver', 'collectibles', 'business', 'rugs', 'art', 'music']);
    let doc = home();
    const bed = doc.rooms[1].id;
    doc = addItem(doc, { ...emptyDraft(bed), name: 'Shotgun', category: 'firearms', valueCents: 320000 }, NOW).doc;
    doc = addItem(doc, { ...emptyDraft(bed), name: 'Rifle', category: 'firearms', valueCents: 90000 }, NOW).doc;
    doc = addItem(doc, { ...emptyDraft(bed), name: 'Road bike', category: 'sports', valueCents: 400000 }, NOW).doc;
    // Firearms are capped at $2,500 for theft: the $3,200 shotgun is worth asking about, the rifle and the bike are not.
    expect(coverage(doc).toSchedule.map((i) => i.name)).toEqual(['Engagement ring', 'Shotgun']);
  });

  it('asks for a firearm’s serial number, and names the new kinds as insurers do', () => {
    let doc = home();
    doc = addItem(doc, { ...emptyDraft(doc.rooms[1].id), name: 'Shotgun', category: 'firearms' }, NOW).doc;
    expect(needsSerial(doc.items.find((i) => i.name === 'Shotgun')!)).toBe(true);
    expect(CATEGORY_LABELS.jewelry).toBe('Jewelry, watches and furs');
    expect([CATEGORY_LABELS.silver, CATEGORY_LABELS.collectibles, CATEGORY_LABELS.business, CATEGORY_LABELS.rugs]).toEqual([
      'Silverware and fine china',
      'Collectibles',
      'Business equipment',
      'Rugs and textiles',
    ]);
  });

  it('keeps the new kinds and their limits through a save and a load', () => {
    let doc = home();
    doc = addItem(doc, { ...emptyDraft(doc.rooms[1].id), name: 'Baseball cards', category: 'collectibles', valueCents: 50000 }, NOW).doc;
    doc = updatePolicy(doc, { categoryLimits: { firearms: 250000, collectibles: 200000 } });
    const back = parseDoc(JSON.parse(JSON.stringify(doc)), NOW);
    expect(back.items.find((i) => i.name === 'Baseball cards')!.category).toBe('collectibles');
    expect(back.policy.categoryLimits).toEqual({ firearms: 250000, collectibles: 200000 });
  });

  it('keeps policy documents, and they count as files in use', () => {
    let doc = addPolicyDocuments(home(), [{ id: 'policydoc1', name: 'Policy.pdf', kind: 'pdf', bytes: 10, addedAt: NOW }]);
    expect(filesInUse(doc).get('policydoc1')).toBe('policydoc1.pdf');
    const back = parseDoc(JSON.parse(JSON.stringify(doc)), NOW);
    expect(back.policy.documents).toEqual(doc.policy.documents);
    doc = removePolicyDocument(doc, 'policydoc1');
    expect(filesInUse(doc).size).toBe(0);
  });
});

describe('room videos', () => {
  it('adds and keeps videos, and drops them with their room', () => {
    let doc = home();
    const room = doc.rooms[0].id;
    doc = addRoomVideo(doc, room, { id: 'video00001', durationMs: 42000, bytes: 1000, takenAt: null, addedAt: NOW, ext: 'mov' });
    expect(filesInUse(doc).get('video00001')).toBe('video00001.mov');
    expect(parseDoc(JSON.parse(JSON.stringify(doc)), NOW).rooms[0].videos[0].durationMs).toBe(42000);
    doc = deleteRoom(doc, room, doc.rooms[1].id, NOW);
    expect(filesInUse(doc).size).toBe(0);
  });
});

describe('reminders', () => {
  it('plans nothing until a reminder is turned on', () => {
    expect(planReminders(libraryOf(home()), NOW)).toEqual([]);
  });

  it('plans a yearly look, a backup nudge and warranty endings', () => {
    let doc = setReminders(home(), { yearly: true, backup: true, warranty: true });
    doc = { ...doc, meta: { ...doc.meta, modifiedAt: NOW } };
    const plan = planReminders(libraryOf(doc), NOW);
    const kinds = plan.map((p) => p.kind);
    expect(kinds).toEqual(['yearly', 'backup', 'warranty']);
    expect(new Date(plan[0].fireAt).getFullYear()).toBe(2027);
    expect(plan[1].fireAt).toBe(new Date(2026, 10, 18, 18).getTime());
    expect(plan[2]).toMatchObject({ title: 'Warranty ending: Television', fireAt: new Date(2026, 11, 11, 10).getTime() });
  });

  it('does not nudge about a backup that is current, or a warranty already ending', () => {
    let doc = setReminders(home(), { backup: true, warranty: true });
    doc = { ...doc, meta: { ...doc.meta, lastBackupAt: NOW + 1 } };
    expect(planReminders(libraryOf(doc), NOW + 40 * DAY)).toEqual([]);
  });
});

describe('reading text from photos', () => {
  it('finds the serial number on a label', () => {
    const lines = ['NORVIK', 'MODEL OL65-A2', 'S/N: NV65A2X0418K', 'MADE IN KOREA', 'AC 120V 60Hz'];
    expect(serialCandidates(lines)[0]).toBe('NV65A2X0418K');
    expect(serialCandidates(['Serial Number', 'C02XK1ZZJGH5'])[0]).toBe('C02XK1ZZJGH5');
    expect(serialCandidates(['IMEI 356938035643809'])[0]).toBe('356938035643809');
    expect(serialCandidates(['Thank you'])).toEqual([]);
  });

  it('reads the date, total and shop from a receipt', () => {
    const lines = ['BRIGHTWAY', 'ELECTRONICS', 'Store 0418 Till 03', 'OLED TV 65IN 1,899.00', 'SUBTOTAL 2,101.99', 'TAX 168.16', 'TOTAL 2,270.15', '03/04/2021 14:22'];
    expect(readReceipt(lines, '2026-11-15')).toEqual({ date: '2021-03-04', totalCents: 227015, store: 'Brightway' });
    expect(readReceipt(['Corner Shop', '4 Mar 2021', 'Total', '12.50'], '2026-11-15')).toEqual({ date: '2021-03-04', totalCents: 1250, store: 'Corner Shop' });
    expect(readReceipt(['Shop', '01/01/2030', 'TOTAL 5.00'], '2026-11-15').date).toBeNull();
  });
});
