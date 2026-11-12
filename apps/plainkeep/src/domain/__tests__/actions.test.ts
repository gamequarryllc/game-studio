import { addJob, addReading, addThing, deleteEntry, deleteJob, deleteReading, deleteThing, logEntry, markDone, setSettings, updateEntry, updateJob, updateThing } from '../actions';
import { emptyDoc } from '../doc';
import { canAddThing, freeThingsLeft, FREE_THING_LIMIT } from '../limits';
import { currentReading } from '../schedule';
import { LIMITS } from '../types';

import { CAR, HOME, NOW, TODAY, base, nextId, withJob } from '../__fixtures__/helpers';

describe('things', () => {
  it('adds a vehicle with its first reading, and a home with none', () => {
    const doc = base();
    expect(doc.things.map((t) => [t.name, t.kind, t.readings.length])).toEqual([
      ['Home', 'home', 0],
      ['Wagon', 'vehicle', 1],
    ]);
    expect(currentReading(doc.things[1])).toEqual({ ymd: TODAY, value: 60000 });
  });

  it('refuses a thing with no name, and trims long ones', () => {
    const doc = emptyDoc(NOW);
    expect(addThing(doc, { kind: 'home', icon: 'house', name: '   ', detail: '' }, NOW)).toBe(doc);
    const long = addThing(doc, { kind: 'home', icon: 'house', name: 'x'.repeat(200), detail: '' }, NOW);
    expect(long.things[0].name).toHaveLength(LIMITS.name);
  });

  it('renames, and ignores a rename to nothing', () => {
    let doc = base();
    doc = updateThing(doc, HOME, { name: '  The   cabin ', detail: 'Lake road' }, NOW);
    expect(doc.things[0]).toMatchObject({ name: 'The cabin', detail: 'Lake road' });
    expect(updateThing(doc, HOME, { name: '' }, NOW)).toBe(doc);
  });

  it('deleting a thing takes its jobs and its log with it, and nothing else', () => {
    let doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    doc = withJob(doc, { thingId: CAR, lastDoneYmd: '2026-09-01' }, 'wipers0001');
    doc = deleteThing(doc, HOME, NOW);
    expect(doc.things.map((t) => t.id)).toEqual([CAR]);
    expect(doc.jobs.map((j) => j.id)).toEqual(['wipers0001']);
    expect(doc.entries.every((e) => e.thingId === CAR)).toBe(true);
  });

  it('counts things against the free version, and not at all with Pro', () => {
    expect(FREE_THING_LIMIT).toBe(2);
    expect(canAddThing(1, false)).toBe(true);
    expect(canAddThing(2, false)).toBe(false);
    expect(canAddThing(40, true)).toBe(true);
    expect(freeThingsLeft(1, false)).toBe(1);
    expect(freeThingsLeft(5, false)).toBe(0);
    expect(freeThingsLeft(5, true)).toBeNull();
  });
});

describe('readings', () => {
  it('keeps one reading a day, in order', () => {
    let doc = base();
    doc = addReading(doc, CAR, { ymd: '2026-10-01', value: 58000 }, NOW);
    doc = addReading(doc, CAR, { ymd: '2026-10-01', value: 58250 }, NOW);
    expect(doc.things[1].readings).toEqual([
      { ymd: '2026-10-01', value: 58250 },
      { ymd: TODAY, value: 60000 },
    ]);
    doc = deleteReading(doc, CAR, '2026-10-01', NOW);
    expect(doc.things[1].readings).toHaveLength(1);
  });

  it('ignores a reading for a thing with no odometer, and nonsense figures', () => {
    const doc = base();
    expect(addReading(doc, HOME, { ymd: TODAY, value: 10 }, NOW)).toBe(doc);
    expect(addReading(doc, CAR, { ymd: TODAY, value: -5 }, NOW)).toBe(doc);
    expect(addReading(doc, CAR, { ymd: TODAY, value: Number.NaN }, NOW)).toBe(doc);
    expect(addReading(doc, CAR, { ymd: TODAY, value: 99_999_999 }, NOW)).toBe(doc);
  });
});

describe('jobs and the log', () => {
  it('a job added with its last date starts its own log', () => {
    const doc = withJob(base(), { thingId: HOME, name: 'Furnace filter', lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(doc.jobs[0]).toMatchObject({ name: 'Furnace filter', startYmd: null, anchor: 'done' });
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({ jobId: 'filter0001', title: 'Furnace filter', ymd: '2026-09-01', skipped: false });
  });

  it('a job on a missing thing or with no name is not added', () => {
    const doc = base();
    expect(withJob(doc, { thingId: 'nothing000001' }, 'x000000001')).toBe(doc);
    expect(addJob(doc, { thingId: HOME, name: ' ', note: '', every: null, everyDistance: null, anchor: 'done', leadDays: null }, NOW)).toBe(doc);
  });

  it('logging a distance on a car also records the odometer, and never winds it back', () => {
    let doc = withJob(base(), { thingId: CAR, every: null, everyDistance: 5000 }, 'oil0000001');
    doc = markDone(doc, 'oil0000001', { ymd: '2026-10-20', distance: 59200, cost: 7495, note: ' Dealer ' }, NOW, nextId());
    expect(doc.things[1].readings[0]).toEqual({ ymd: '2026-10-20', value: 59200 });
    expect(doc.entries[0]).toMatchObject({ distance: 59200, cost: 7495, note: 'Dealer' });
    // A lower figure logged for a day that already has a reading leaves the reading alone.
    doc = logEntry(doc, { thingId: CAR, jobId: null, title: 'Wash', ymd: TODAY, distance: 100, cost: null, note: '', skipped: false }, NOW, nextId());
    expect(currentReading(doc.things[1])).toEqual({ ymd: TODAY, value: 60000 });
  });

  it('a log line on a home has no distance, and a skipped one has no cost', () => {
    let doc = logEntry(base(), { thingId: HOME, jobId: null, title: 'Fixed tap', ymd: TODAY, distance: 500, cost: 1200, note: '', skipped: false }, NOW, 'entry00001');
    expect(doc.entries[0]).toMatchObject({ distance: null, cost: 1200 });
    doc = logEntry(doc, { thingId: HOME, jobId: null, title: 'Skipped', ymd: TODAY, distance: null, cost: 999, note: '', skipped: true }, NOW, 'entry00002');
    expect(doc.entries[1].cost).toBeNull();
  });

  it('edits and deletes a log line', () => {
    let doc = logEntry(base(), { thingId: HOME, jobId: null, title: 'Fixed tap', ymd: TODAY, distance: null, cost: 1200, note: '', skipped: false }, NOW, 'entry00001');
    doc = updateEntry(doc, 'entry00001', { title: 'Fixed kitchen tap', cost: 1500, ymd: '2026-11-10' }, NOW);
    expect(doc.entries[0]).toMatchObject({ title: 'Fixed kitchen tap', cost: 1500, ymd: '2026-11-10' });
    expect(deleteEntry(doc, 'entry00001', NOW).entries).toHaveLength(0);
    expect(deleteEntry(doc, 'nope', NOW)).toBe(doc);
  });

  it('deleting a job keeps its history in the log as one-offs', () => {
    let doc = withJob(base(), { thingId: HOME, name: 'Furnace filter', lastDoneYmd: '2026-09-01' }, 'filter0001');
    doc = deleteJob(doc, 'filter0001', NOW);
    expect(doc.jobs).toHaveLength(0);
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({ jobId: null, title: 'Furnace filter' });
  });

  it('a fixed schedule falls back to counting from done when it loses its interval', () => {
    let doc = withJob(base(), { thingId: CAR, every: { n: 1, unit: 'year' }, anchor: 'fixed', firstDueYmd: '2026-03-31' }, 'reg0000001');
    expect(doc.jobs[0].anchor).toBe('fixed');
    doc = updateJob(doc, 'reg0000001', { every: null }, NOW);
    expect(doc.jobs[0].anchor).toBe('done');
  });

  it('changes settings without touching anything else', () => {
    const doc = base();
    const next = setSettings(doc, { distanceUnit: 'km', leadDays: 14 }, NOW + 5);
    expect(next.settings).toMatchObject({ distanceUnit: 'km', leadDays: 14, currency: 'USD' });
    expect(next.things).toBe(doc.things);
    expect(next.updatedAt).toBe(NOW + 5);
  });
});
