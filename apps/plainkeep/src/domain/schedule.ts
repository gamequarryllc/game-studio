import { addDays, addInterval, daysBetween, intervalDays } from './dates';
import type { Doc, Entry, Job, Reading, Thing, Ymd } from './types';

// When each job is next due. Everything here is plain arithmetic on the
// document and today's date, so it can be tested without a phone.

/** A job's log lines, oldest first. */
export function entriesOf(jobId: string, entries: Entry[]): Entry[] {
  return entries.filter((e) => e.jobId === jobId).sort((a, b) => (a.ymd === b.ymd ? a.createdAt - b.createdAt : a.ymd < b.ymd ? -1 : 1));
}

/** The latest line for a job, done or skipped: what the schedule counts from. */
export function lastEntry(jobId: string, entries: Entry[]): Entry | null {
  const own = entriesOf(jobId, entries);
  return own.length > 0 ? own[own.length - 1] : null;
}

/** The last time the job was really done. */
export function lastDone(jobId: string, entries: Entry[]): Entry | null {
  const own = entriesOf(jobId, entries).filter((e) => !e.skipped);
  return own.length > 0 ? own[own.length - 1] : null;
}

/** Readings in order: by day, and by value within a day. */
export function sortedReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => (a.ymd === b.ymd ? a.value - b.value : a.ymd < b.ymd ? -1 : 1));
}

/** What the odometer says now, as far as the app knows. */
export function currentReading(thing: Thing): Reading | null {
  const sorted = sortedReadings(thing.readings);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

/** The latest reading on or before a day. */
export function readingAsOf(thing: Thing, ymd: Ymd): Reading | null {
  let found: Reading | null = null;
  for (const r of sortedReadings(thing.readings)) {
    if (r.ymd <= ymd) found = r;
  }
  return found;
}

/** The shortest stretch of readings a daily rate is worked out from. */
const RATE_MIN_DAYS = 14;
/** Only the last year of driving counts: habits change. */
const RATE_WINDOW_DAYS = 365;

/**
 * How far the vehicle goes in a day, from its own readings. null until there
 * are two readings at least two weeks apart.
 */
export function distancePerDay(thing: Thing): number | null {
  const sorted = sortedReadings(thing.readings);
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1];
  const from = addDays(last.ymd, -RATE_WINDOW_DAYS);
  const first = sorted.find((r) => r.ymd >= from) ?? sorted[0];
  let start = first;
  if (daysBetween(start.ymd, last.ymd) < RATE_MIN_DAYS) start = sorted[0];
  const days = daysBetween(start.ymd, last.ymd);
  if (days < RATE_MIN_DAYS) return null;
  const rate = (last.value - start.value) / days;
  return rate > 0 ? rate : null;
}

/** A fixed job done this early still counts for the date that is coming up: a quarter of its interval. */
const EARLY_SHARE = 0.25;

/** The next date a job is due by the calendar; null when it does not go by the calendar (or is finished). */
export function nextDueYmd(job: Job, entries: Entry[]): Ymd | null {
  const last = lastEntry(job.id, entries);
  if (!job.every) {
    // Happens once: due on its date until it has been done.
    return last ? null : job.startYmd;
  }
  if (job.anchor === 'fixed' && job.startYmd) {
    if (!last) return job.startYmd;
    const reach = addDays(last.ymd, Math.floor(intervalDays(job.every) * EARLY_SHARE));
    if (reach < job.startYmd) return job.startYmd;
    // The last date on the schedule that this covers; the next one after it is due.
    let k = Math.max(0, Math.floor(daysBetween(job.startYmd, reach) / intervalDays(job.every)) - 1);
    while (addInterval(job.startYmd, job.every, k + 1) <= reach) k += 1;
    while (k > 0 && addInterval(job.startYmd, job.every, k) > reach) k -= 1;
    return addInterval(job.startYmd, job.every, k + 1);
  }
  if (last) return addInterval(last.ymd, job.every);
  return job.startYmd;
}

/** The odometer reading an entry was made at: its own, or the reading on record for that day. */
export function distanceAt(entry: Entry, thing: Thing): number | null {
  if (entry.distance !== null) return entry.distance;
  return readingAsOf(thing, entry.ymd)?.value ?? null;
}

/** The odometer reading at which a job is next due; null when it does not go by distance. */
export function nextDueDistance(job: Job, entries: Entry[], thing: Thing): number | null {
  if (thing.kind !== 'vehicle') return null;
  const last = lastEntry(job.id, entries);
  if (!last) return job.startDistance;
  if (job.everyDistance === null) return null;
  const at = distanceAt(last, thing);
  return at === null ? null : at + job.everyDistance;
}

export type DueState =
  /** Past its date, or past its distance. */
  | 'overdue'
  /** Due today, or the odometer has just reached it. */
  | 'today'
  | 'soon'
  /** Never logged, and nobody has said when it was last done: there is nothing honest to count down from. */
  | 'unlogged'
  | 'later'
  /** A distance job on a vehicle with no reading to judge it by. */
  | 'unknown'
  | 'paused'
  /** A one-off that has been done. */
  | 'finished';

export interface Due {
  state: DueState;
  /** Due by the calendar. */
  ymd: Ymd | null;
  /** Due at this odometer reading. */
  distance: number | null;
  /** Calendar days left to `ymd`; negative when past. */
  daysLeft: number | null;
  /** Distance left to `distance`; negative when past. */
  distanceLeft: number | null;
  /** Which of the two runs out first. */
  by: 'date' | 'distance' | null;
  /** The day to plan around: the calendar date, or the day the odometer should reach the distance, whichever is sooner. */
  whenYmd: Ymd | null;
  /** How much of the interval has gone, 0 to 1 (more than 1 when overdue); null when it cannot be said. */
  used: number | null;
}

/**
 * "Coming up" is the next 30 days, for every job alike. One window for all of them keeps the list in
 * order: nothing in "Later" is ever sooner than something in "Coming up".
 */
export const SOON_DAYS = 30;

/** "Soon" by distance: the last tenth of the interval, and at least 300. */
export function soonDistance(job: Job): number {
  return Math.max(300, Math.round((job.everyDistance ?? 0) * 0.1));
}

function clamp01plus(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, n);
}

export function dueOf(job: Job, doc: Pick<Doc, 'things' | 'entries'>, today: Ymd): Due {
  const none: Due = { state: 'later', ymd: null, distance: null, daysLeft: null, distanceLeft: null, by: null, whenYmd: null, used: null };
  const thing = doc.things.find((t) => t.id === job.thingId);
  if (!thing) return { ...none, state: 'unknown' };
  if (job.paused) return { ...none, state: 'paused' };

  const last = lastEntry(job.id, doc.entries);
  if (job.unsure && !last) {
    // The day to check it by is kept for the reminder; nothing is counted down.
    return { ...none, state: 'unlogged', whenYmd: job.startYmd };
  }
  const ymd = nextDueYmd(job, doc.entries);
  const distance = nextDueDistance(job, doc.entries, thing);
  if (ymd === null && distance === null) {
    const repeats = job.every !== null || job.everyDistance !== null;
    // A one-off that is done is finished. A repeating distance job with no reading at its last entry cannot be placed.
    return { ...none, state: last && !repeats ? 'finished' : 'unknown' };
  }

  const daysLeft = ymd === null ? null : daysBetween(today, ymd);
  const now = currentReading(thing);
  const distanceLeft = distance === null || now === null ? null : distance - now.value;

  // The day the odometer should reach the distance, at the vehicle's own pace.
  let reachYmd: Ymd | null = null;
  if (distance !== null && now !== null) {
    if (distance <= now.value) reachYmd = now.ymd;
    else {
      const rate = distancePerDay(thing);
      if (rate !== null) reachYmd = addDays(now.ymd, Math.min(Math.ceil((distance - now.value) / rate), 36_500));
    }
  }

  let by: Due['by'] = null;
  if (ymd !== null && reachYmd !== null) by = reachYmd < ymd ? 'distance' : 'date';
  else if (ymd !== null) by = 'date';
  else if (distance !== null) by = 'distance';
  const whenYmd = by === 'date' ? ymd : reachYmd;

  // How much of the interval is used up.
  let usedByDate: number | null = null;
  if (ymd !== null) {
    let from: Ymd;
    if (job.every && job.anchor === 'fixed') from = addInterval(ymd, job.every, -1);
    else if (last) from = last.ymd;
    else from = todayOf(job.createdAt);
    const total = daysBetween(from, ymd);
    usedByDate = total <= 0 ? 1 : clamp01plus(daysBetween(from, today) / total);
  }
  let usedByDistance: number | null = null;
  if (distance !== null && now !== null) {
    const span = job.everyDistance ?? null;
    const from = span !== null ? distance - span : null;
    usedByDistance = from === null || span === null || span <= 0 ? (distance <= now.value ? 1 : null) : clamp01plus((now.value - from) / span);
  }
  const used = usedByDate === null ? usedByDistance : usedByDistance === null ? usedByDate : Math.max(usedByDate, usedByDistance);

  let state: DueState;
  if ((daysLeft !== null && daysLeft < 0) || (distanceLeft !== null && distanceLeft < 0)) state = 'overdue';
  else if (daysLeft === 0 || distanceLeft === 0) state = 'today';
  else if (daysLeft === null && distanceLeft === null) state = 'unknown';
  else if ((daysLeft !== null && daysLeft <= SOON_DAYS) || (distanceLeft !== null && distanceLeft <= soonDistance(job))) state = 'soon';
  else if (whenYmd !== null && by === 'distance' && daysBetween(today, whenYmd) <= SOON_DAYS) state = 'soon';
  else state = 'later';

  return { state, ymd, distance, daysLeft, distanceLeft, by, whenYmd, used };
}

function todayOf(ms: number): Ymd {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Listed {
  job: Job;
  thing: Thing;
  due: Due;
}

const ORDER: Record<DueState, number> = { overdue: 0, today: 1, soon: 2, unlogged: 3, later: 4, unknown: 5, paused: 6, finished: 7 };

/** A number to sort by within a state: how close the job is, in days where that can be said. */
function urgency(due: Due, today: Ymd): number {
  // The day to plan around, when there is one: it already takes the nearer of the date and the odometer.
  if (due.whenYmd !== null && due.state !== 'unlogged') {
    const days = daysBetween(today, due.whenYmd);
    // Past its reading: the further past, the more pressing.
    if (due.distanceLeft !== null && due.distanceLeft < 0) return Math.min(days, due.distanceLeft / 40);
    return days;
  }
  if (due.distanceLeft !== null) return due.distanceLeft / 40;
  return Number.MAX_SAFE_INTEGER;
}

/** Every job with its thing and when it is due, most pressing first. */
export function listJobs(doc: Pick<Doc, 'things' | 'jobs' | 'entries'>, today: Ymd): Listed[] {
  const things = new Map(doc.things.map((t) => [t.id, t]));
  const out: Listed[] = [];
  for (const job of doc.jobs) {
    const thing = things.get(job.thingId);
    if (!thing) continue;
    out.push({ job, thing, due: dueOf(job, doc, today) });
  }
  return out.sort((a, b) => {
    const s = ORDER[a.due.state] - ORDER[b.due.state];
    if (s !== 0) return s;
    const u = urgency(a.due, today) - urgency(b.due, today);
    if (u !== 0) return u;
    return a.job.name.localeCompare(b.job.name);
  });
}

export interface DueGroups {
  overdue: Listed[];
  soon: Listed[];
  unlogged: Listed[];
  later: Listed[];
  unknown: Listed[];
  paused: Listed[];
  finished: Listed[];
}

export function groupJobs(listed: Listed[]): DueGroups {
  const g: DueGroups = { overdue: [], soon: [], unlogged: [], later: [], unknown: [], paused: [], finished: [] };
  for (const item of listed) {
    const s = item.due.state;
    if (s === 'overdue') g.overdue.push(item);
    else if (s === 'today' || s === 'soon') g.soon.push(item);
    else if (s === 'unlogged') g.unlogged.push(item);
    else if (s === 'later') g.later.push(item);
    else if (s === 'unknown') g.unknown.push(item);
    else if (s === 'paused') g.paused.push(item);
    else g.finished.push(item);
  }
  return g;
}
