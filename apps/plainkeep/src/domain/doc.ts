import { isValidYmd } from './dates';
import { isSafeId } from './ids';
import { CURRENCIES } from './money';
import { LIMITS, THING_ICONS, type Doc, type Entry, type Interval, type Job, type Reading, type Settings, type Thing, type ThingIcon } from './types';

// Making, reading and writing the document. Reading is strict about shape and
// forgiving about content: a line that cannot be understood is dropped, and
// the rest of the document is kept.

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  distanceUnit: 'mi',
  leadDays: 7,
  remindHour: 9,
  remindMinute: 0,
  reminders: false,
  onboarded: false,
};

export function emptyDoc(now: number, settings: Partial<Settings> = {}): Doc {
  return { format: 1, things: [], jobs: [], entries: [], settings: { ...DEFAULT_SETTINGS, ...settings }, updatedAt: now };
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc);
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const whole = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.round(v) >= min && Math.round(v) <= max ? Math.round(v) : null;
const stamp = (v: unknown, now: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : now);

function parseInterval(v: unknown): Interval | null {
  if (!isObj(v)) return null;
  const n = whole(v.n, 1, LIMITS.intervalN);
  if (n === null) return null;
  if (v.unit !== 'day' && v.unit !== 'week' && v.unit !== 'month' && v.unit !== 'year') return null;
  return { n, unit: v.unit };
}

function parseReadings(v: unknown): Reading[] {
  if (!Array.isArray(v)) return [];
  const out: Reading[] = [];
  for (const r of v.slice(0, LIMITS.readings)) {
    if (!isObj(r) || !isValidYmd(r.ymd)) continue;
    const value = whole(r.value, 0, LIMITS.distance);
    if (value === null) continue;
    out.push({ ymd: r.ymd, value });
  }
  return out;
}

function parseThing(v: unknown, now: number): Thing | null {
  if (!isObj(v) || !isSafeId(v.id)) return null;
  const name = text(v.name, LIMITS.name).trim();
  if (name === '') return null;
  const kind = v.kind === 'home' || v.kind === 'vehicle' || v.kind === 'other' ? v.kind : 'other';
  const icon: ThingIcon = (THING_ICONS as readonly string[]).includes(v.icon as string) ? (v.icon as ThingIcon) : kind === 'home' ? 'house' : kind === 'vehicle' ? 'car' : 'box';
  return { id: v.id, kind, icon, name, detail: text(v.detail, LIMITS.detail), readings: kind === 'vehicle' ? parseReadings(v.readings) : [], createdAt: stamp(v.createdAt, now) };
}

function parseJob(v: unknown, things: Set<string>, now: number): Job | null {
  if (!isObj(v) || !isSafeId(v.id) || !isSafeId(v.thingId) || !things.has(v.thingId)) return null;
  const name = text(v.name, LIMITS.name).trim();
  if (name === '') return null;
  const every = parseInterval(v.every);
  const everyDistance = whole(v.everyDistance, 1, LIMITS.distance);
  const startYmd = isValidYmd(v.startYmd) ? v.startYmd : null;
  return {
    id: v.id,
    thingId: v.thingId,
    name,
    note: text(v.note, LIMITS.note),
    every,
    everyDistance,
    // A fixed schedule needs a date to hang from; without one it counts from when it was done.
    anchor: v.anchor === 'fixed' && every !== null && startYmd !== null ? 'fixed' : 'done',
    startYmd,
    startDistance: whole(v.startDistance, 0, LIMITS.distance),
    leadDays: whole(v.leadDays, 0, LIMITS.leadDays),
    unsure: v.unsure === true,
    paused: v.paused === true,
    createdAt: stamp(v.createdAt, now),
  };
}

function parseEntry(v: unknown, things: Set<string>, jobs: Set<string>, now: number): Entry | null {
  if (!isObj(v) || !isSafeId(v.id) || !isSafeId(v.thingId) || !things.has(v.thingId) || !isValidYmd(v.ymd)) return null;
  const title = text(v.title, LIMITS.name).trim();
  if (title === '') return null;
  return {
    id: v.id,
    thingId: v.thingId,
    jobId: isSafeId(v.jobId) && jobs.has(v.jobId) ? v.jobId : null,
    title,
    ymd: v.ymd,
    distance: whole(v.distance, 0, LIMITS.distance),
    cost: whole(v.cost, 0, LIMITS.cents),
    note: text(v.note, LIMITS.note),
    skipped: v.skipped === true,
    createdAt: stamp(v.createdAt, now),
  };
}

function parseSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  const currency = typeof s.currency === 'string' && CURRENCIES.some((c) => c.code === s.currency) ? s.currency : DEFAULT_SETTINGS.currency;
  return {
    currency,
    distanceUnit: s.distanceUnit === 'km' ? 'km' : 'mi',
    leadDays: whole(s.leadDays, 0, LIMITS.leadDays) ?? DEFAULT_SETTINGS.leadDays,
    remindHour: whole(s.remindHour, 0, 23) ?? DEFAULT_SETTINGS.remindHour,
    remindMinute: whole(s.remindMinute, 0, 59) ?? DEFAULT_SETTINGS.remindMinute,
    reminders: s.reminders === true,
    onboarded: s.onboarded === true,
  };
}

/** Reads a document from an object. Throws when it is not a Plainkeep document at all. */
export function parseDoc(value: unknown, now: number): Doc {
  if (!isObj(value)) throw new Error('Not a Plainkeep document');
  if (value.format !== 1) throw new Error(typeof value.format === 'number' && value.format > 1 ? 'Made by a newer version of Plainkeep' : 'Not a Plainkeep document');
  if (!Array.isArray(value.things) || !Array.isArray(value.jobs) || !Array.isArray(value.entries)) throw new Error('Not a Plainkeep document');

  const things: Thing[] = [];
  const thingIds = new Set<string>();
  for (const raw of value.things.slice(0, LIMITS.things)) {
    const thing = parseThing(raw, now);
    if (!thing || thingIds.has(thing.id)) continue;
    thingIds.add(thing.id);
    things.push(thing);
  }
  const jobs: Job[] = [];
  const jobIds = new Set<string>();
  for (const raw of value.jobs.slice(0, LIMITS.jobs)) {
    const job = parseJob(raw, thingIds, now);
    if (!job || jobIds.has(job.id)) continue;
    jobIds.add(job.id);
    jobs.push(job);
  }
  const entries: Entry[] = [];
  const entryIds = new Set<string>();
  for (const raw of value.entries.slice(0, LIMITS.entries)) {
    const entry = parseEntry(raw, thingIds, jobIds, now);
    if (!entry || entryIds.has(entry.id)) continue;
    entryIds.add(entry.id);
    entries.push(entry);
  }
  return { format: 1, things, jobs, entries, settings: parseSettings(value.settings), updatedAt: stamp(value.updatedAt, now) };
}

export function parseDocText(textValue: string, now: number): Doc {
  return parseDoc(JSON.parse(textValue) as unknown, now);
}
