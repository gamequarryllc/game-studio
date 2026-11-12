import { addDays, addInterval, intervalDays, todayYmd } from './dates';
import { newId } from './ids';
import { currentReading, sortedReadings } from './schedule';
import { LIMITS, type Doc, type Entry, type Interval, type Job, type Reading, type Settings, type Thing, type ThingIcon, type ThingKind, type Ymd } from './types';

// Every change to the document. Each takes the document and returns a new one;
// none of them touches the phone, so they can all be tested directly.

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNote = (s: string) => s.replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.note);

function touch(doc: Doc, now: number, patch: Partial<Doc>): Doc {
  return { ...doc, ...patch, updatedAt: now };
}

export interface ThingInput {
  kind: ThingKind;
  icon: ThingIcon;
  name: string;
  detail: string;
  /** For a vehicle: what the odometer says today, if known. */
  odometer?: number | null;
}

export function addThing(doc: Doc, input: ThingInput, now: number, id: string = newId()): Doc {
  const name = clean(input.name, LIMITS.name);
  if (name === '' || doc.things.length >= LIMITS.things) return doc;
  const readings: Reading[] = input.kind === 'vehicle' && input.odometer != null ? [{ ymd: todayYmd(now), value: input.odometer }] : [];
  const thing: Thing = { id, kind: input.kind, icon: input.icon, name, detail: clean(input.detail, LIMITS.detail), readings, createdAt: now };
  return touch(doc, now, { things: [...doc.things, thing] });
}

export function updateThing(doc: Doc, id: string, patch: Partial<Pick<Thing, 'name' | 'detail' | 'icon'>>, now: number): Doc {
  let changed = false;
  const things = doc.things.map((t) => {
    if (t.id !== id) return t;
    const name = patch.name !== undefined ? clean(patch.name, LIMITS.name) : t.name;
    if (name === '') return t;
    changed = true;
    return { ...t, name, detail: patch.detail !== undefined ? clean(patch.detail, LIMITS.detail) : t.detail, icon: patch.icon ?? t.icon };
  });
  return changed ? touch(doc, now, { things }) : doc;
}

/** Deletes a thing with its jobs and its log. */
export function deleteThing(doc: Doc, id: string, now: number): Doc {
  if (!doc.things.some((t) => t.id === id)) return doc;
  return touch(doc, now, {
    things: doc.things.filter((t) => t.id !== id),
    jobs: doc.jobs.filter((j) => j.thingId !== id),
    entries: doc.entries.filter((e) => e.thingId !== id),
  });
}

/** Records what the odometer says on a day. One reading a day: a later one for the same day replaces it. */
export function addReading(doc: Doc, thingId: string, reading: Reading, now: number): Doc {
  const thing = doc.things.find((t) => t.id === thingId);
  if (!thing || thing.kind !== 'vehicle') return doc;
  if (!Number.isFinite(reading.value) || reading.value < 0 || reading.value > LIMITS.distance) return doc;
  const value = Math.round(reading.value);
  const kept = thing.readings.filter((r) => r.ymd !== reading.ymd);
  const readings = sortedReadings([...kept, { ymd: reading.ymd, value }]).slice(-LIMITS.readings);
  return touch(doc, now, { things: doc.things.map((t) => (t.id === thingId ? { ...t, readings } : t)) });
}

export function deleteReading(doc: Doc, thingId: string, ymd: Ymd, now: number): Doc {
  const thing = doc.things.find((t) => t.id === thingId);
  if (!thing || !thing.readings.some((r) => r.ymd === ymd)) return doc;
  return touch(doc, now, { things: doc.things.map((t) => (t.id === thingId ? { ...t, readings: t.readings.filter((r) => r.ymd !== ymd) } : t)) });
}

export interface JobInput {
  thingId: string;
  name: string;
  note: string;
  every: Interval | null;
  everyDistance: number | null;
  anchor: 'done' | 'fixed';
  /** When it was last done, if the person knows. It becomes the first line of the job's log. */
  lastDoneYmd?: Ymd | null;
  /** The odometer when it was last done, if known. */
  lastDoneDistance?: number | null;
  /** The first due date, when it has not been done (or the date a fixed schedule hangs from). */
  firstDueYmd?: Ymd | null;
  /** The reading it is first due at, when that is known and it has not been done. */
  firstDueDistance?: number | null;
  leadDays: number | null;
}

/**
 * When a job has never been logged and the person does not know when it was
 * last done, it first comes up within a month, so it can be checked, rather
 * than a whole interval away.
 */
export function defaultFirstDue(every: Interval | null, today: Ymd): Ymd {
  if (!every) return addDays(today, 30);
  return intervalDays(every) <= 30 ? addInterval(today, every) : addDays(today, 30);
}

function validInterval(every: Interval | null): Interval | null {
  if (!every) return null;
  const n = Math.round(every.n);
  return n >= 1 && n <= LIMITS.intervalN ? { n, unit: every.unit } : null;
}

export function addJob(doc: Doc, input: JobInput, now: number, id: string = newId(), entryId: string = newId()): Doc {
  const thing = doc.things.find((t) => t.id === input.thingId);
  const name = clean(input.name, LIMITS.name);
  if (!thing || name === '' || doc.jobs.length >= LIMITS.jobs) return doc;
  const today = todayYmd(now);
  const every = validInterval(input.every);
  const everyDistance = thing.kind === 'vehicle' && input.everyDistance != null && input.everyDistance >= 1 ? Math.min(Math.round(input.everyDistance), LIMITS.distance) : null;
  const lastDone = input.lastDoneYmd ?? null;
  const fixed = input.anchor === 'fixed' && every !== null;

  let startYmd: Ymd | null = null;
  if (fixed) startYmd = input.firstDueYmd ?? defaultFirstDue(every, today);
  else if (every !== null && !lastDone) startYmd = input.firstDueYmd ?? defaultFirstDue(every, today);
  else if (every === null && everyDistance === null) startYmd = input.firstDueYmd ?? null;

  let startDistance: number | null = null;
  if (thing.kind === 'vehicle' && !lastDone) {
    if (input.firstDueDistance != null) startDistance = Math.round(input.firstDueDistance);
    else if (everyDistance !== null) {
      // Not done as far as the app knows: first due one interval from the odometer's reading now.
      const reading = currentReading(thing);
      startDistance = reading ? reading.value + everyDistance : null;
    }
  }

  const job: Job = {
    id,
    thingId: thing.id,
    name,
    note: cleanNote(input.note),
    every,
    everyDistance,
    anchor: fixed ? 'fixed' : 'done',
    startYmd,
    startDistance,
    leadDays: input.leadDays,
    paused: false,
    createdAt: now,
  };
  let next = touch(doc, now, { jobs: [...doc.jobs, job] });
  if (lastDone) {
    next = logEntry(next, { thingId: thing.id, jobId: id, title: name, ymd: lastDone, distance: input.lastDoneDistance ?? null, cost: null, note: '', skipped: false }, now, entryId);
  }
  return next;
}

export type JobPatch = Partial<Pick<Job, 'name' | 'note' | 'every' | 'everyDistance' | 'anchor' | 'startYmd' | 'startDistance' | 'leadDays' | 'paused'>>;

export function updateJob(doc: Doc, id: string, patch: JobPatch, now: number): Doc {
  let changed = false;
  const jobs = doc.jobs.map((j) => {
    if (j.id !== id) return j;
    const thing = doc.things.find((t) => t.id === j.thingId);
    const name = patch.name !== undefined ? clean(patch.name, LIMITS.name) : j.name;
    if (name === '') return j;
    const every = patch.every !== undefined ? validInterval(patch.every) : j.every;
    const startYmd = patch.startYmd !== undefined ? patch.startYmd : j.startYmd;
    let anchor = patch.anchor ?? j.anchor;
    if (anchor === 'fixed' && (every === null || startYmd === null)) anchor = 'done';
    let everyDistance = patch.everyDistance !== undefined ? patch.everyDistance : j.everyDistance;
    if (thing?.kind !== 'vehicle' || everyDistance == null || everyDistance < 1) everyDistance = null;
    changed = true;
    return {
      ...j,
      name,
      note: patch.note !== undefined ? cleanNote(patch.note) : j.note,
      every,
      everyDistance: everyDistance === null ? null : Math.min(Math.round(everyDistance), LIMITS.distance),
      anchor,
      startYmd,
      startDistance: patch.startDistance !== undefined ? patch.startDistance : j.startDistance,
      leadDays: patch.leadDays !== undefined ? patch.leadDays : j.leadDays,
      paused: patch.paused ?? j.paused,
    };
  });
  return changed ? touch(doc, now, { jobs }) : doc;
}

/** Deletes a job. Its log lines stay in the log as one-offs, so the history of the thing is not lost. */
export function deleteJob(doc: Doc, id: string, now: number): Doc {
  if (!doc.jobs.some((j) => j.id === id)) return doc;
  return touch(doc, now, {
    jobs: doc.jobs.filter((j) => j.id !== id),
    entries: doc.entries.map((e) => (e.jobId === id ? { ...e, jobId: null } : e)),
  });
}

export type EntryInput = Omit<Entry, 'id' | 'createdAt'>;

/** Adds a line to the log. A distance on a vehicle's line is also an odometer reading for that day. */
export function logEntry(doc: Doc, input: EntryInput, now: number, id: string = newId()): Doc {
  const thing = doc.things.find((t) => t.id === input.thingId);
  const title = clean(input.title, LIMITS.name);
  if (!thing || title === '' || doc.entries.length >= LIMITS.entries) return doc;
  const jobId = input.jobId && doc.jobs.some((j) => j.id === input.jobId && j.thingId === thing.id) ? input.jobId : null;
  const distance = thing.kind === 'vehicle' && input.distance != null && input.distance >= 0 ? Math.min(Math.round(input.distance), LIMITS.distance) : null;
  const cost = input.cost != null && input.cost >= 0 ? Math.min(Math.round(input.cost), LIMITS.cents) : null;
  const entry: Entry = { id, thingId: thing.id, jobId, title, ymd: input.ymd, distance, cost: input.skipped ? null : cost, note: cleanNote(input.note), skipped: input.skipped, createdAt: now };
  let next = touch(doc, now, { entries: [...doc.entries, entry] });
  if (distance !== null) {
    // Keep the higher figure when the day already has a reading: an odometer never goes back.
    const same = thing.readings.find((r) => r.ymd === entry.ymd);
    if (!same || same.value < distance) next = addReading(next, thing.id, { ymd: entry.ymd, value: distance }, now);
  }
  return next;
}

/** Marks a job done on a day. */
export function markDone(doc: Doc, jobId: string, details: { ymd: Ymd; distance?: number | null; cost?: number | null; note?: string }, now: number, id: string = newId()): Doc {
  const job = doc.jobs.find((j) => j.id === jobId);
  if (!job) return doc;
  return logEntry(doc, { thingId: job.thingId, jobId, title: job.name, ymd: details.ymd, distance: details.distance ?? null, cost: details.cost ?? null, note: details.note ?? '', skipped: false }, now, id);
}

/** Moves a job on to its next date without anything having been done. */
export function skipOnce(doc: Doc, jobId: string, ymd: Ymd, now: number, id: string = newId()): Doc {
  const job = doc.jobs.find((j) => j.id === jobId);
  if (!job) return doc;
  const thing = doc.things.find((t) => t.id === job.thingId);
  const reading = thing ? currentReading(thing) : null;
  // The skip is counted from the odometer as it stands, so a distance job moves on too.
  return logEntry(doc, { thingId: job.thingId, jobId, title: job.name, ymd, distance: reading?.value ?? null, cost: null, note: '', skipped: true }, now, id);
}

export function updateEntry(doc: Doc, id: string, patch: Partial<Pick<Entry, 'title' | 'ymd' | 'distance' | 'cost' | 'note'>>, now: number): Doc {
  let changed = false;
  const entries = doc.entries.map((e) => {
    if (e.id !== id) return e;
    const title = patch.title !== undefined ? clean(patch.title, LIMITS.name) : e.title;
    if (title === '') return e;
    changed = true;
    return {
      ...e,
      title,
      ymd: patch.ymd ?? e.ymd,
      distance: patch.distance !== undefined ? patch.distance : e.distance,
      cost: patch.cost !== undefined ? patch.cost : e.cost,
      note: patch.note !== undefined ? cleanNote(patch.note) : e.note,
    };
  });
  return changed ? touch(doc, now, { entries }) : doc;
}

export function deleteEntry(doc: Doc, id: string, now: number): Doc {
  if (!doc.entries.some((e) => e.id === id)) return doc;
  return touch(doc, now, { entries: doc.entries.filter((e) => e.id !== id) });
}

export function setSettings(doc: Doc, patch: Partial<Settings>, now: number): Doc {
  return touch(doc, now, { settings: { ...doc.settings, ...patch } });
}
