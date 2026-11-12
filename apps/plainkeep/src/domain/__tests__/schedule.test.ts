import { addReading, markDone, skipOnce, updateJob } from '../actions';
import { distancePerDay, dueOf, groupJobs, listJobs, nextDueDistance, nextDueYmd, SOON_DAYS } from '../schedule';
import type { Doc, Job } from '../types';

import { CAR, HOME, NOW, TODAY, base, nextId, withJob } from '../__fixtures__/helpers';

const job = (doc: Doc, id: string): Job => doc.jobs.find((j) => j.id === id) as Job;
const due = (doc: Doc, id: string, today = TODAY) => dueOf(job(doc, id), doc, today);

describe('a job that counts from when it was last done', () => {
  it('is due one interval after the last time', () => {
    const doc = withJob(base(), { thingId: HOME, every: { n: 3, unit: 'month' }, lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(nextDueYmd(job(doc, 'filter0001'), doc.entries)).toBe('2026-12-01');
    const d = due(doc, 'filter0001');
    expect(d).toMatchObject({ state: 'soon', daysLeft: 19, by: 'date', whenYmd: '2026-12-01' });
    expect(d.used).toBeCloseTo(72 / 91, 2);
  });

  it('moves on when it is done again, early or late', () => {
    let doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    doc = markDone(doc, 'filter0001', { ymd: '2026-11-12' }, NOW, nextId());
    expect(due(doc, 'filter0001')).toMatchObject({ state: 'later', ymd: '2027-02-12', daysLeft: 92 });
    expect(due(doc, 'filter0001').used).toBe(0);
  });

  it('is overdue the day after its date, and due today on it', () => {
    const doc = withJob(base(), { thingId: HOME, every: { n: 1, unit: 'month' }, lastDoneYmd: '2026-10-12' }, 'alarm00001');
    expect(due(doc, 'alarm00001')).toMatchObject({ state: 'today', daysLeft: 0 });
    expect(due(doc, 'alarm00001', '2026-11-13')).toMatchObject({ state: 'overdue', daysLeft: -1 });
    expect(due(doc, 'alarm00001', '2026-11-13').used).toBeGreaterThan(1);
  });

  it('is "not logged yet", with a day to check it by and no countdown, when nobody knows when it was last done', () => {
    const yearly = withJob(base(), { thingId: HOME, every: { n: 1, unit: 'year' } }, 'hvac000001');
    expect(job(yearly, 'hvac000001').unsure).toBe(true);
    expect(due(yearly, 'hvac000001')).toEqual({ state: 'unlogged', ymd: null, distance: null, daysLeft: null, distanceLeft: null, by: null, whenYmd: '2026-12-12', used: null });
    const weekly = withJob(base(), { thingId: HOME, every: { n: 1, unit: 'week' } }, 'bins000001');
    expect(due(weekly, 'bins000001')).toMatchObject({ state: 'unlogged', whenYmd: '2026-11-19' });
    // Logged once, it is an ordinary job from then on.
    const logged = markDone(yearly, 'hvac000001', { ymd: '2026-11-01' }, NOW, nextId());
    expect(due(logged, 'hvac000001')).toMatchObject({ state: 'later', ymd: '2027-11-01' });
    // Given a first date, it is not unsure: that date is real.
    const dated = withJob(base(), { thingId: HOME, every: { n: 1, unit: 'year' }, firstDueYmd: '2026-12-01' }, 'dated00001');
    expect(due(dated, 'dated00001')).toMatchObject({ state: 'soon', ymd: '2026-12-01', daysLeft: 19 });
  });

  it('counts a skipped turn as a turn', () => {
    let doc = withJob(base(), { thingId: HOME, every: { n: 6, unit: 'month' }, lastDoneYmd: '2026-05-01' }, 'gutter0001');
    expect(due(doc, 'gutter0001').state).toBe('overdue');
    doc = skipOnce(doc, 'gutter0001', TODAY, NOW, nextId());
    expect(due(doc, 'gutter0001')).toMatchObject({ state: 'later', ymd: '2027-05-12' });
  });

  it('"coming up" is the next 30 days for every job, so nothing later is ever listed above something sooner', () => {
    expect(SOON_DAYS).toBe(30);
    let doc = base();
    // A yearly job 30 days out and a two-monthly job 19 days out are both coming up; 31 days out is later.
    doc = withJob(doc, { thingId: HOME, name: 'Yearly', every: { n: 1, unit: 'year' }, lastDoneYmd: '2025-12-12' }, 'year000001');
    doc = withJob(doc, { thingId: HOME, name: 'Two-monthly', every: { n: 2, unit: 'month' }, lastDoneYmd: '2026-10-01' }, 'twom000001');
    doc = withJob(doc, { thingId: HOME, name: 'Just outside', every: { n: 1, unit: 'year' }, lastDoneYmd: '2025-12-13' }, 'out0000001');
    doc = withJob(doc, { thingId: HOME, name: 'Unknown' }, 'unsure0001');
    const groups = groupJobs(listJobs(doc, TODAY));
    expect(groups.soon.map((l) => l.job.name)).toEqual(['Two-monthly', 'Yearly']);
    expect(groups.unlogged.map((l) => l.job.name)).toEqual(['Unknown']);
    expect(groups.later.map((l) => l.job.name)).toEqual(['Just outside']);
    const all = listJobs(doc, TODAY).filter((l) => l.due.daysLeft !== null).map((l) => l.due.daysLeft);
    expect(all).toEqual([...all].sort((a, b) => (a as number) - (b as number)));
  });
});

describe('a job that stays on its calendar date', () => {
  const reg = (doc: Doc, last?: string) => withJob(doc, { thingId: CAR, name: 'Registration', every: { n: 1, unit: 'year' }, anchor: 'fixed', firstDueYmd: '2026-03-31', lastDoneYmd: last }, 'reg0000001');

  it('is due on the date it hangs from until it is done', () => {
    expect(due(reg(base()), 'reg0000001')).toMatchObject({ ymd: '2026-03-31', state: 'overdue' });
  });

  it('done a little early or a little late, the next one is the same date next year', () => {
    expect(nextDueYmd(job(reg(base(), '2026-03-17'), 'reg0000001'), reg(base(), '2026-03-17').entries)).toBe('2027-03-31');
    const late = reg(base(), '2026-04-10');
    expect(nextDueYmd(job(late, 'reg0000001'), late.entries)).toBe('2027-03-31');
  });

  it('done very late, it is still due on the next date, not a year after that', () => {
    const veryLate = reg(base(), '2026-11-01');
    expect(nextDueYmd(job(veryLate, 'reg0000001'), veryLate.entries)).toBe('2027-03-31');
  });

  it('done long before its first date, the first date still stands', () => {
    const early = reg(base(), '2025-09-01');
    expect(nextDueYmd(job(early, 'reg0000001'), early.entries)).toBe('2026-03-31');
  });

  it('keeps the day of the month through short months', () => {
    let doc = withJob(base(), { thingId: HOME, name: 'Rent', every: { n: 1, unit: 'month' }, anchor: 'fixed', firstDueYmd: '2026-01-31' }, 'rent000001');
    doc = markDone(doc, 'rent000001', { ymd: '2026-01-31' }, NOW, nextId());
    expect(nextDueYmd(job(doc, 'rent000001'), doc.entries)).toBe('2026-02-28');
    doc = markDone(doc, 'rent000001', { ymd: '2026-02-28' }, NOW, nextId());
    expect(nextDueYmd(job(doc, 'rent000001'), doc.entries)).toBe('2026-03-31');
  });

  it('fills the gauge from the previous date on the schedule', () => {
    const doc = reg(base(), '2026-03-17');
    const d = due(doc, 'reg0000001');
    // From 2026-03-31 to 2027-03-31, with 226 days gone.
    expect(d.used).toBeCloseTo(226 / 365, 2);
  });
});

describe('a job that goes by the odometer', () => {
  it('is due one interval after the reading it was last done at', () => {
    const doc = withJob(base(), { thingId: CAR, every: null, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    expect(nextDueDistance(job(doc, 'oil0000001'), doc.entries, doc.things[1])).toBe(62000);
    expect(due(doc, 'oil0000001')).toMatchObject({ state: 'later', distance: 62000, distanceLeft: 2000, by: 'distance', ymd: null });
    expect(due(doc, 'oil0000001').used).toBeCloseTo(0.6, 5);
  });

  it('comes due as the odometer climbs, without a date', () => {
    let doc = withJob(base(), { thingId: CAR, every: null, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    doc = addReading(doc, CAR, { ymd: TODAY, value: 61800 }, NOW);
    expect(due(doc, 'oil0000001')).toMatchObject({ state: 'soon', distanceLeft: 200 });
    doc = addReading(doc, CAR, { ymd: TODAY, value: 62000 }, NOW);
    expect(due(doc, 'oil0000001')).toMatchObject({ state: 'today', distanceLeft: 0 });
    doc = addReading(doc, CAR, { ymd: TODAY, value: 62350 }, NOW);
    expect(due(doc, 'oil0000001')).toMatchObject({ state: 'overdue', distanceLeft: -350 });
  });

  it('with a date as well, whichever comes first decides', () => {
    // 6 months from Aug 1 is Feb 1; 5,000 from 57,000 is 62,000, and the car does about 29 a day.
    const doc = withJob(base(), { thingId: CAR, every: { n: 6, unit: 'month' }, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    const d = due(doc, 'oil0000001');
    expect(d).toMatchObject({ ymd: '2027-02-01', distance: 62000, distanceLeft: 2000 });
    expect(distancePerDay(doc.things[1])).toBeCloseTo(3000 / 103, 3);
    // 2,000 left at 29.1 a day is 69 days: January 20, before the date.
    expect(d).toMatchObject({ by: 'distance', whenYmd: '2027-01-20', state: 'later' });
  });

  it('works out the pace only from readings at least two weeks apart', () => {
    let doc = base();
    expect(distancePerDay(doc.things[1])).toBeNull();
    doc = addReading(doc, CAR, { ymd: '2026-11-05', value: 59800 }, NOW);
    expect(distancePerDay(doc.things[1])).toBeNull();
    doc = addReading(doc, CAR, { ymd: '2026-10-13', value: 59100 }, NOW);
    expect(distancePerDay(doc.things[1])).toBeCloseTo(30, 5);
  });

  it('never done and nobody knows when: not logged yet; given a first reading, it is due at it', () => {
    const doc = withJob(base(), { thingId: CAR, every: null, everyDistance: 6000 }, 'rotate0001');
    expect(due(doc, 'rotate0001').state).toBe('unlogged');
    expect(job(doc, 'rotate0001').startDistance).toBe(66000);
    const given = withJob(base(), { thingId: CAR, every: null, everyDistance: 6000, firstDueDistance: 64000 }, 'rotate0002');
    expect(due(given, 'rotate0002')).toMatchObject({ distance: 64000, distanceLeft: 4000, state: 'later' });
  });

  it('cannot be placed without a reading, and says so rather than guessing', () => {
    let doc = base();
    doc = { ...doc, things: doc.things.map((t) => (t.id === CAR ? { ...t, readings: [] } : t)) };
    doc = withJob(doc, { thingId: CAR, every: null, everyDistance: 6000, lastDoneYmd: '2026-08-01' }, 'rotate0001');
    expect(due(doc, 'rotate0001').state).toBe('unknown');
  });

  it('uses the reading on record for a day when the log line has none', () => {
    let doc = withJob(base(), { thingId: CAR, every: null, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    doc = markDone(doc, 'oil0000001', { ymd: TODAY }, NOW, nextId());
    expect(nextDueDistance(job(doc, 'oil0000001'), doc.entries, doc.things[1])).toBe(65000);
  });

  it('is ignored on a thing with no odometer', () => {
    const doc = withJob(base(), { thingId: HOME, every: null, everyDistance: 5000, firstDueYmd: '2026-12-01' }, 'odd0000001');
    expect(job(doc, 'odd0000001').everyDistance).toBeNull();
  });
});

describe('one-offs, pausing and the list', () => {
  it('a one-off is due on its date and finished once done', () => {
    let doc = withJob(base(), { thingId: HOME, name: 'Replace roof', every: null, firstDueYmd: '2027-06-01' }, 'roof000001');
    expect(due(doc, 'roof000001')).toMatchObject({ state: 'later', ymd: '2027-06-01' });
    doc = markDone(doc, 'roof000001', { ymd: TODAY }, NOW, nextId());
    expect(due(doc, 'roof000001').state).toBe('finished');
  });

  it('a paused job is not due', () => {
    let doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2025-01-01' }, 'mower00001');
    doc = updateJob(doc, 'mower00001', { paused: true }, NOW);
    expect(due(doc, 'mower00001')).toMatchObject({ state: 'paused', whenYmd: null });
  });

  it('lists the most pressing first and groups them', () => {
    let doc = base();
    doc = withJob(doc, { thingId: HOME, name: 'Later', lastDoneYmd: '2026-11-01' }, 'later00001');
    doc = withJob(doc, { thingId: HOME, name: 'Very late', lastDoneYmd: '2026-01-01' }, 'late000001');
    doc = withJob(doc, { thingId: HOME, name: 'A bit late', lastDoneYmd: '2026-08-01' }, 'late000002');
    doc = withJob(doc, { thingId: HOME, name: 'Soon', lastDoneYmd: '2026-08-20' }, 'soon000001');
    doc = withJob(doc, { thingId: HOME, name: 'Away', lastDoneYmd: '2026-08-20' }, 'away000001');
    doc = updateJob(doc, 'away000001', { paused: true }, NOW);
    const listed = listJobs(doc, TODAY);
    expect(listed.map((l) => l.job.name)).toEqual(['Very late', 'A bit late', 'Soon', 'Later', 'Away']);
    const groups = groupJobs(listed);
    expect(groups.overdue).toHaveLength(2);
    expect(groups.soon).toHaveLength(1);
    expect(groups.later).toHaveLength(1);
    expect(groups.paused).toHaveLength(1);
  });
});
