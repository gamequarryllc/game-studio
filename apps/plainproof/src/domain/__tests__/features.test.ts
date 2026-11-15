import {
  addItem,
  addPolicyDocuments,
  addRoomVideo,
  addRooms,
  claimedItems,
  closeClaim,
  deleteRoom,
  emptyDraft,
  openClaim,
  removePolicyDocument,
  setItemLoss,
  setReminders,
  updateClaim,
  updatePolicy,
} from '../actions';
import { buildCsv } from '../csv';
import { coverage } from '../coverage';
import { emptyDoc, filesInUse, parseDoc } from '../doc';
import { libraryOf, setCurrentDoc, stampChanges } from '../library';
import { planReminders } from '../reminders';
import { buildReportHtml, reportFileName } from '../report';
import { readReceipt, serialCandidates } from '../scan';
import { backupState } from '../selectors';
import type { Doc } from '../types';

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
  it('opens a claim when the first item is marked, and closes it without touching the items', () => {
    let doc = home();
    expect(doc.claim).toBeNull();
    doc = setItemLoss(doc, doc.items[2].id, 'stolen', 'Taken from the dresser', NOW);
    doc = setItemLoss(doc, doc.items[1].id, 'stolen', undefined, NOW);
    expect(doc.claim?.openedAt).toBe(NOW);
    expect(claimedItems(doc).map((i) => i.name)).toEqual(['Laptop', 'Engagement ring']);
    doc = setItemLoss(doc, doc.items[1].id, null, undefined, NOW);
    expect(claimedItems(doc).map((i) => i.name)).toEqual(['Engagement ring']);
    const closed = closeClaim(doc, NOW);
    expect(closed.claim).toBeNull();
    expect(closed.items).toHaveLength(4);
    expect(closed.items.every((i) => i.loss === null && i.lossNote === '')).toBe(true);
  });

  it('keeps the claim details tidy and refuses a loss date in the future', () => {
    let doc = openClaim(home(), NOW);
    doc = updateClaim(doc, { claimNumber: '  CL-123 ', cause: 'theft', lossDate: '2026-11-12', description: 'Break-in\nthrough the back door' }, NOW);
    expect(doc.claim).toEqual({ openedAt: NOW, lossDate: '2026-11-12', cause: 'theft', claimNumber: 'CL-123', description: 'Break-in\nthrough the back door' });
    expect(updateClaim(doc, { lossDate: '2027-01-01' }, NOW).claim?.lossDate).toBeNull();
  });

  it('makes a claim schedule with only the claimed items and the claim on top', () => {
    let doc = home();
    doc = updateClaim(setItemLoss(doc, doc.items[2].id, 'stolen', 'Taken from the dresser', NOW), { claimNumber: 'CL-123', cause: 'theft', lossDate: '2026-11-12', description: 'Back door forced' }, NOW);
    doc = setItemLoss(doc, doc.items[0].id, 'damaged', 'Pushed off the stand', NOW);
    doc = updatePolicy(doc, { deductibleCents: 50000 });
    const html = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW, scope: 'claim' });
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
    expect(reportFileName(doc, NOW, 'claim')).toBe('Home-inventory-claim-2026-11-15');
  });

  it('writes a claim spreadsheet with the loss in front', () => {
    let doc = home();
    doc = setItemLoss(doc, doc.items[2].id, 'stolen', 'From the dresser, with "box"', NOW);
    const rows = buildCsv(doc, { claim: true }).replace('﻿', '').trimEnd().split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith('Loss,What happened,Room,Item')).toBe(true);
    expect(rows[1].startsWith('Stolen,"From the dresser, with ""box""",Bedroom,Engagement ring,Jewelry and watches')).toBe(true);
  });

  it('survives a save and load, and repairs a bad loss status', () => {
    let doc = setItemLoss(home(), home().items[0].id, 'stolen', '', NOW);
    doc = setItemLoss(doc, doc.items[0].id, 'stolen', 'x', NOW);
    const raw = JSON.parse(JSON.stringify(doc));
    raw.items[1].loss = 'vaporised';
    const back = parseDoc(raw, NOW);
    expect(back.items[0].loss).toBe('stolen');
    expect(back.items[1].loss).toBeNull();
    expect(back.claim?.openedAt).toBe(NOW);
  });

  it('counts as a change for the backup', () => {
    const lib = libraryOf(home());
    const marked = setItemLoss(lib.places[0].doc, lib.places[0].doc.items[0].id, 'stolen', '', NOW);
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
