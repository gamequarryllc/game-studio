import { addDays, atTime, daysBetween, shortYmd, todayYmd, weekdayName } from './dates';
import { span } from './labels';
import { currentReading, listJobs } from './schedule';
import type { Doc, Ymd } from './types';

// Which reminders should be waiting on the phone, worked out from the document
// alone. The phone keeps at most 64; the nearest ones are the ones that matter.

export const MAX_PLANNED = 48;
/** After a due date passes without the job being done: one nudge at each of these, then silence. */
export const FOLLOW_UP_DAYS = [3, 10] as const;
/** How long an odometer reading stays fresh before the app asks for a new one. */
export const READING_STALE_DAYS = 30;

/**
 * What a reminder is for. 'after' ones only matter if the job is still not done when they fire:
 * doing the job replans everything, and they are gone.
 */
export type PlannedKind = 'ahead' | 'day' | 'after' | 'check' | 'odometer' | 'several';

export interface Planned {
  kind: PlannedKind;
  /** Stable for the same reminder, so the same plan always schedules the same things. */
  key: string;
  fireAt: number;
  title: string;
  body: string;
  /** The job to open when it is tapped; null opens the list of what is due. */
  jobId: string | null;
  /** The thing to open (for an odometer nudge). */
  thingId: string | null;
}

interface Single extends Planned {
  what: string;
  where: string;
}

function whenWords(dueYmd: Ymd, onYmd: Ymd, today: Ymd): string {
  const days = daysBetween(onYmd, dueYmd);
  if (days === 0) return 'due today';
  if (days < 0) return `${span(days)} overdue`;
  if (days === 1) return 'due tomorrow';
  if (days < 7) return `due ${weekdayName(dueYmd)}`;
  return `due in ${span(days)}, on ${shortYmd(dueYmd, today)}`;
}

/** The reminders that should be scheduled as of `now`, soonest first. */
export function planReminders(doc: Doc, now: number): Planned[] {
  if (!doc.settings.reminders) return [];
  const today = todayYmd(now);
  const { remindHour: hour, remindMinute: minute } = doc.settings;
  const singles: Single[] = [];

  for (const { job, thing, due } of listJobs(doc, today)) {
    if (due.state === 'paused' || due.state === 'finished' || due.whenYmd === null) continue;
    const dueYmd = due.whenYmd;
    const common = { title: job.name, jobId: job.id, thingId: thing.id, what: job.name, where: thing.name };
    if (due.state === 'unlogged') {
      // Nobody knows when it was last done: one nudge to look, one more, and no countdown.
      for (const day of [dueYmd, addDays(dueYmd, FOLLOW_UP_DAYS[1])]) {
        const fireAt = atTime(day, hour, minute);
        if (fireAt > now) singles.push({ ...common, kind: 'check', key: `job:${job.id}:${day}`, fireAt, body: `${thing.name} · not logged yet. When was it last done?` });
      }
      continue;
    }
    const lead = job.leadDays ?? doc.settings.leadDays;
    const days = new Map<Ymd, PlannedKind>();
    for (const after of FOLLOW_UP_DAYS) days.set(addDays(dueYmd, after), 'after');
    if (lead > 0) days.set(addDays(dueYmd, -lead), 'ahead');
    days.set(dueYmd, 'day');
    for (const [day, kind] of days) {
      const fireAt = atTime(day, hour, minute);
      if (fireAt <= now) continue;
      singles.push({ ...common, kind, key: `job:${job.id}:${day}`, fireAt, body: `${thing.name} · ${whenWords(dueYmd, day, today)}` });
    }
  }

  // A vehicle whose jobs go by distance needs its odometer kept up, or those jobs can never come due.
  for (const thing of doc.things) {
    if (thing.kind !== 'vehicle') continue;
    if (!doc.jobs.some((j) => j.thingId === thing.id && !j.paused && j.everyDistance !== null)) continue;
    const reading = currentReading(thing);
    let day = reading ? addDays(reading.ymd, READING_STALE_DAYS) : addDays(today, 1);
    while (atTime(day, hour, minute) <= now) day = addDays(day, READING_STALE_DAYS);
    singles.push({
      kind: 'odometer',
      key: `odo:${thing.id}:${day}`,
      fireAt: atTime(day, hour, minute),
      title: `${thing.name}: what does the odometer say?`,
      body: 'Its mileage jobs are timed from the reading. It takes a few seconds to update.',
      jobId: null,
      thingId: thing.id,
      what: '',
      where: thing.name,
    });
  }

  // Several jobs falling at the same minute arrive as one reminder, not a stack of them.
  const byTime = new Map<number, Single[]>();
  for (const s of singles) {
    if (!s.key.startsWith('job:')) continue;
    const list = byTime.get(s.fireAt) ?? [];
    list.push(s);
    byTime.set(s.fireAt, list);
  }
  const planned: Planned[] = singles.filter((s) => !s.key.startsWith('job:')).map(({ what: _w, where: _p, ...rest }) => rest);
  for (const [fireAt, list] of byTime) {
    if (list.length === 1) {
      const { what: _w, where: _p, ...rest } = list[0];
      planned.push(rest);
      continue;
    }
    // Two things can have a job of the same name: say whose each is.
    const names = list.map((s) => `${s.what} (${s.where})`);
    const shown = names.slice(0, 3).join(', ');
    planned.push({
      kind: 'several',
      key: `group:${fireAt}`,
      fireAt,
      // A batch of jobs nobody has logged (a home just set up) asks its own question.
      title: list.every((s) => s.kind === 'check') ? `${list.length} jobs aren’t logged yet` : `${list.length} jobs need a look`,
      body: names.length > 3 ? `${shown} and ${names.length - 3} more` : shown,
      jobId: null,
      thingId: null,
    });
  }

  return planned.sort((a, b) => (a.fireAt === b.fireAt ? a.key.localeCompare(b.key) : a.fireAt - b.fireAt)).slice(0, MAX_PLANNED);
}
