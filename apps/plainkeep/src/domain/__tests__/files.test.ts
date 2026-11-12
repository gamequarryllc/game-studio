import { logEntry } from '../actions';
import { BACKUP_KIND, backupName, makeBackup, readBackup } from '../backup';
import { csvCell, logCsv } from '../csv';
import { emptyDoc, parseDoc, parseDocText, serializeDoc } from '../doc';
import { dueText, dueWhere, groupDigits, intervalText, leadText, repeatText, span } from '../labels';
import { centsToInput, currencyForLocale, formatMoney, parseMoney } from '../money';
import { reportBaseName, serviceRecordHtml } from '../report';
import { sampleDoc, SAMPLE_IDS } from '../sample';
import { dueOf, groupJobs, listJobs } from '../schedule';
import { logByYear, matchesSearch, spentBetween } from '../selectors';
import { templateDistance, templatesFor, VEHICLE_TEMPLATES } from '../templates';
import type { Doc, Job } from '../types';

import { CAR, HOME, NOW, TODAY, base, withJob } from '../__fixtures__/helpers';

describe('saving and reading the document', () => {
  it('reads back exactly what it wrote', () => {
    const doc = sampleDoc(NOW);
    expect(parseDocText(serializeDoc(doc), NOW)).toEqual(doc);
  });

  it('refuses what is not a Plainkeep document, and one from a newer version', () => {
    expect(() => parseDoc(null, NOW)).toThrow('Not a Plainkeep document');
    expect(() => parseDoc({ format: 1, things: 'x', jobs: [], entries: [] }, NOW)).toThrow();
    expect(() => parseDoc({ format: 2, things: [], jobs: [], entries: [] }, NOW)).toThrow('newer version');
  });

  it('drops lines it cannot understand and keeps the rest', () => {
    const good = sampleDoc(NOW);
    const raw = JSON.parse(serializeDoc(good)) as { things: unknown[]; jobs: Record<string, unknown>[]; entries: Record<string, unknown>[]; settings: Record<string, unknown> };
    raw.things.push({ id: 'bad id!', name: 'x' }, { id: 'okid00000001', name: '' }, 7);
    raw.jobs.push({ id: 'orphan000001', thingId: 'missing00001', name: 'Orphan' });
    raw.jobs[0].every = { n: 0, unit: 'month' };
    raw.jobs[1].anchor = 'fixed';
    raw.jobs[1].startYmd = '2026-02-30';
    raw.entries.push({ id: 'badday000001', thingId: SAMPLE_IDS.home, title: 'x', ymd: '2026-13-40' });
    raw.entries[0].cost = -5;
    raw.settings.currency = 'XXX';
    raw.settings.remindHour = 99;
    const doc = parseDoc(raw, NOW);
    expect(doc.things).toHaveLength(good.things.length);
    expect(doc.jobs).toHaveLength(good.jobs.length);
    expect(doc.jobs[0].every).toBeNull();
    expect(doc.jobs[1]).toMatchObject({ anchor: 'done', startYmd: null });
    expect(doc.entries).toHaveLength(good.entries.length);
    expect(doc.entries[0].cost).toBeNull();
    expect(doc.settings).toMatchObject({ currency: 'USD', remindHour: 9 });
  });

  it('a home never keeps odometer readings, whatever the file says', () => {
    const raw = JSON.parse(serializeDoc(base())) as { things: { readings: unknown[] }[] };
    raw.things[0].readings = [{ ymd: TODAY, value: 5 }];
    expect(parseDoc(raw, NOW).things[0].readings).toEqual([]);
  });
});

describe('backups', () => {
  it('restores everything, and treats the restored phone as set up', () => {
    const doc: Doc = { ...sampleDoc(NOW), settings: { ...sampleDoc(NOW).settings, onboarded: false } };
    const text = makeBackup(doc, NOW);
    expect(JSON.parse(text)).toMatchObject({ kind: BACKUP_KIND, version: 1, exportedAt: NOW });
    const read = readBackup(text, NOW);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.doc.things).toEqual(doc.things);
      expect(read.doc.jobs).toEqual(doc.jobs);
      expect(read.doc.entries).toEqual(doc.entries);
      expect(read.doc.settings.onboarded).toBe(true);
      expect(read.exportedAt).toBe(NOW);
    }
    expect(backupName(TODAY)).toBe('Plainkeep backup 2026-11-12.json');
  });

  it('holds nothing about Pro', () => {
    expect(makeBackup(sampleDoc(NOW), NOW)).not.toMatch(/pro|owned|pretend/i);
  });

  it('says what is wrong with a file it cannot use', () => {
    expect(readBackup('hello', NOW)).toEqual({ ok: false, problem: 'not-a-backup' });
    expect(readBackup('[]', NOW)).toEqual({ ok: false, problem: 'not-a-backup' });
    expect(readBackup(JSON.stringify({ kind: 'something-else' }), NOW)).toEqual({ ok: false, problem: 'not-a-backup' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 2, doc: {} }), NOW)).toEqual({ ok: false, problem: 'newer-version' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, doc: { format: 1 } }), NOW)).toEqual({ ok: false, problem: 'damaged' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, doc: { format: 3, things: [], jobs: [], entries: [] } }), NOW)).toEqual({ ok: false, problem: 'newer-version' });
  });
});

describe('the spreadsheet', () => {
  it('lists what was done, oldest first, without skipped turns', () => {
    let doc = base();
    doc = logEntry(doc, { thingId: CAR, jobId: null, title: 'Brake pads, front', ymd: '2026-10-02', distance: 58900, cost: 41200, note: 'Shop said "rotors next time"\nSecond line', skipped: false }, NOW, 'entry00001');
    doc = logEntry(doc, { thingId: HOME, jobId: null, title: '=SUM(A1)', ymd: '2026-03-01', distance: null, cost: null, note: '', skipped: false }, NOW, 'entry00002');
    doc = logEntry(doc, { thingId: HOME, jobId: null, title: 'Skipped thing', ymd: '2026-04-01', distance: null, cost: null, note: '', skipped: true }, NOW, 'entry00003');
    const lines = logCsv(doc).replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Date,For,What was done,Odometer (mi),Cost (USD),Note',
      "2026-03-01,Home,'=SUM(A1),,,",
      '2026-10-02,Wagon,"Brake pads, front",58900,412.00,"Shop said ""rotors next time"" Second line"',
    ]);
  });

  it('quotes only what needs it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('-5', false)).toBe('-5');
    expect(csvCell('-5')).toBe("'-5");
  });
});

describe('the service record', () => {
  it('prints one thing’s history, its totals and what is kept up', () => {
    const doc = sampleDoc(NOW);
    const html = serviceRecordHtml(doc, SAMPLE_IDS.car, NOW);
    expect(html).toContain('<h1 class="plate">Outback</h1>');
    expect(html).toContain('Maintenance schedule');
    expect(html).toContain('<dt>Total spent</dt>');
    expect(html).toContain('2019 Subaru Outback 2.5i');
    expect(html).toContain('<dt>Odometer</dt><dd>62,418 mi');
    expect(html).toContain('New front brake pads and rotors');
    expect(html).toContain('$412.00');
    expect(html).toContain('Every 5,000 mi or 6 months');
    expect(html).toContain('<th class="num">Odometer</th>');
    // Only this car's lines.
    expect(html).not.toContain('Furnace filter');
    const total = 7495 + 6850 + 12400 + 41200;
    expect(html).toContain(`<td class="num">${formatMoney(total, 'USD')}</td>`);
  });

  it('has no odometer column for a home, and escapes what people type', () => {
    let doc = base();
    doc = logEntry(doc, { thingId: HOME, jobId: null, title: 'Fixed <b>tap</b> & seal', ymd: TODAY, distance: null, cost: null, note: '', skipped: false }, NOW, 'entry00001');
    const html = serviceRecordHtml(doc, HOME, NOW);
    expect(html).not.toContain('Odometer');
    expect(html).toContain('Fixed &lt;b&gt;tap&lt;/b&gt; &amp; seal');
    expect(html).not.toContain('<tfoot>');
  });

  it('says so when nothing has been logged, and gives nothing for a missing thing', () => {
    expect(serviceRecordHtml(base(), HOME, NOW)).toContain('Nothing has been logged yet.');
    expect(serviceRecordHtml(base(), 'missing', NOW)).toBe('');
    expect(reportBaseName(base().things[1], NOW)).toBe('Wagon service record 2026-11-12');
    expect(reportBaseName({ ...base().things[1], name: '///' }, NOW)).toBe('Service record service record 2026-11-12');
  });
});

describe('words', () => {
  const j = (doc: Doc, id: string) => doc.jobs.find((x) => x.id === id) as Job;

  it('says how long in the unit that reads naturally', () => {
    expect(span(1)).toBe('1 day');
    expect(span(13)).toBe('13 days');
    expect(span(14)).toBe('2 weeks');
    expect(span(55)).toBe('8 weeks');
    expect(span(60)).toBe('2 months');
    expect(span(-400)).toBe('13 months');
    expect(span(800)).toBe('2 years');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('says when a job is due, led by whichever limit is nearer', () => {
    const doc = withJob(base(), { thingId: CAR, every: { n: 6, unit: 'month' }, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    expect(dueText(dueOf(j(doc, 'oil0000001'), doc, TODAY), 'mi', TODAY)).toBe('Due in 2,000 mi, or by Feb 1, 2027');
    const home = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(dueText(dueOf(j(home, 'filter0001'), home, TODAY), 'mi', TODAY)).toBe('Due in 3 weeks');
    expect(dueText(dueOf(j(home, 'filter0001'), home, '2026-12-01'), 'mi', '2026-12-01')).toBe('Due today');
    expect(dueText(dueOf(j(home, 'filter0001'), home, '2026-11-30'), 'mi', '2026-11-30')).toBe('Due tomorrow');
    expect(dueText(dueOf(j(home, 'filter0001'), home, '2026-12-09'), 'mi', '2026-12-09')).toBe('8 days overdue');
  });

  it('says where a job’s limit lies, without repeating how long is left', () => {
    const doc = withJob(base(), { thingId: CAR, every: { n: 6, unit: 'month' }, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    const due = dueOf(j(doc, 'oil0000001'), doc, TODAY);
    expect(dueWhere(due, 'mi', TODAY)).toBe('at 62,000 mi or Feb 1, 2027');
    expect(dueWhere(due, 'mi', TODAY, 'distance')).toBe('at 62,000 mi');
    expect(dueWhere(due, 'mi', TODAY, 'date')).toBe('Feb 1, 2027');
    const home = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(dueWhere(dueOf(j(home, 'filter0001'), home, TODAY), 'mi', TODAY, 'distance')).toBe('Dec 1');
    expect(dueWhere({ ...due, state: 'paused' }, 'mi', TODAY)).toBe('Paused');
  });

  it('says how often a job comes round', () => {
    expect(intervalText({ n: 1, unit: 'year' })).toBe('Every year');
    expect(intervalText({ n: 3, unit: 'month' })).toBe('Every 3 months');
    const job = { every: { n: 6, unit: 'month' }, everyDistance: 5000, anchor: 'done', startYmd: null } as Job;
    expect(repeatText(job, 'mi')).toBe('Every 5,000 mi or 6 months');
    expect(repeatText({ ...job, every: null }, 'km')).toBe('Every 5,000 km');
    expect(repeatText({ ...job, everyDistance: null, every: { n: 1, unit: 'year' }, anchor: 'fixed', startYmd: '2026-03-31' }, 'mi')).toBe('Every year on March 31');
    expect(repeatText({ ...job, every: null, everyDistance: null }, 'mi')).toBe('Once');
    expect(leadText(0)).toBe('On the day');
    expect(leadText(7)).toBe('A week before');
    expect(leadText(3)).toBe('3 days before');
  });

  it('reads and writes money', () => {
    expect(parseMoney('1,299.50')).toEqual({ ok: true, cents: 129950 });
    expect(parseMoney('12,5')).toEqual({ ok: true, cents: 1250 });
    expect(parseMoney('')).toEqual({ ok: true, cents: null });
    expect(parseMoney('abc')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseMoney('9999999999999')).toEqual({ ok: false, reason: 'too-large' });
    expect(centsToInput(129950)).toBe('1299.50');
    expect(centsToInput(1200)).toBe('12');
    expect(formatMoney(129950, 'USD')).toBe('$1,299.50');
    expect(formatMoney(120000, 'USD', { whole: true })).toBe('$1,200');
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale(undefined)).toBe('USD');
  });
});

describe('the log, the suggestions and the sample household', () => {
  it('groups the log by year with what each year cost', () => {
    const doc = sampleDoc(NOW);
    const years = logByYear(doc.entries);
    expect(years[0].year).toBe(2026);
    expect(years[0].entries[0].ymd >= years[0].entries[1].ymd).toBe(true);
    expect(years.reduce((n, y) => n + y.entries.length, 0)).toBe(doc.entries.length);
    expect(spentBetween(doc, SAMPLE_IDS.car, '2000-01-01', TODAY)).toBe(7495 + 6850 + 12400 + 41200);
    expect(spentBetween(base(), null, '2000-01-01', TODAY)).toBeNull();
  });

  it('searches titles, notes and the thing’s name', () => {
    const e = sampleDoc(NOW).entries.find((x) => x.title.includes('brake')) as Doc['entries'][number];
    expect(matchesSearch(e, 'Outback', 'BRAKE')).toBe(true);
    expect(matchesSearch(e, 'Outback', 'warranty')).toBe(true);
    expect(matchesSearch(e, 'Outback', 'outb')).toBe(true);
    expect(matchesSearch(e, 'Outback', 'gutter')).toBe(false);
    expect(matchesSearch(e, 'Outback', '  ')).toBe(true);
  });

  it('suggests jobs for each kind of thing, with distances in the person’s unit', () => {
    expect(templatesFor('home').some((t) => t.name === 'Furnace filter')).toBe(true);
    expect(templatesFor('home').every((t) => t.everyMiles === null)).toBe(true);
    expect(templatesFor('other').length).toBeGreaterThan(3);
    const oil = VEHICLE_TEMPLATES.find((t) => t.key === 'oil') as (typeof VEHICLE_TEMPLATES)[number];
    expect(templateDistance(oil, 'mi')).toBe(5000);
    expect(templateDistance(oil, 'km')).toBe(8000);
    expect(templateDistance(VEHICLE_TEMPLATES.find((t) => t.key === 'coolant') as typeof oil, 'km')).toBe(95000);
    expect(templateDistance(VEHICLE_TEMPLATES.find((t) => t.key === 'wipers') as typeof oil, 'km')).toBeNull();
    const keys = [...templatesFor('home'), ...templatesFor('vehicle')].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the sample household has something in every part of the list', () => {
    const doc = sampleDoc(NOW);
    const groups = groupJobs(listJobs(doc, TODAY));
    expect(groups.overdue.length).toBeGreaterThan(0);
    expect(groups.soon.length).toBeGreaterThan(0);
    expect(groups.later.length).toBeGreaterThan(0);
    expect(doc.things).toHaveLength(4);
    expect(sampleDoc(NOW, 'starter').things).toHaveLength(2);
    expect(emptyDoc(NOW).settings.onboarded).toBe(false);
  });
});
