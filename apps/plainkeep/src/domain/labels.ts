import { dayOfMonth, monthName, shortYmd } from './dates';
import type { Due } from './schedule';
import type { DistanceUnit, Interval, Job, Ymd } from './types';

// The words the app uses for time and distance. One wording for each idea,
// used by every screen, the reminders and the service record.

export function groupDigits(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function distanceText(value: number, unit: DistanceUnit): string {
  return `${groupDigits(value)} ${unit}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A stretch of days in the largest unit that reads naturally: "5 days", "3 weeks", "4 months", "2 years". */
export function span(days: number): string {
  const n = Math.abs(days);
  if (n < 14) return plural(n, 'day');
  if (n < 56) return plural(Math.round(n / 7), 'week');
  if (n < 365 * 2) return plural(Math.round(n / 30.44), 'month');
  return plural(Math.round(n / 365.25), 'year');
}

/** The same stretch as a figure and a unit, for the readout on a job's line. */
export function spanParts(days: number): { figure: string; unit: string } {
  const text = span(days);
  const at = text.indexOf(' ');
  return { figure: text.slice(0, at), unit: text.slice(at + 1) };
}

function byDate(daysLeft: number): string {
  if (daysLeft < 0) return `${span(daysLeft)} overdue`;
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  return `Due in ${span(daysLeft)}`;
}

function byDistance(left: number, unit: DistanceUnit): string {
  if (left < 0) return `${distanceText(-left, unit)} over`;
  if (left === 0) return 'Due now';
  return `Due in ${distanceText(left, unit)}`;
}

/** One line saying when a job is due, led by whichever limit comes first. */
export function dueText(due: Due, unit: DistanceUnit, today: Ymd): string {
  switch (due.state) {
    case 'paused':
      return 'Put away';
    case 'finished':
      return 'Done';
    case 'unknown':
      return due.distance !== null ? `Due at ${distanceText(due.distance, unit)}` : 'Needs an odometer reading';
    default:
      break;
  }
  const date = due.daysLeft !== null ? byDate(due.daysLeft) : null;
  const dist = due.distanceLeft !== null ? byDistance(due.distanceLeft, unit) : null;
  if (date && dist) {
    const dateOver = (due.daysLeft ?? 0) < 0;
    const distOver = (due.distanceLeft ?? 0) < 0;
    if (dateOver && !distOver) return date;
    if (distOver && !dateOver) return dist;
    if (dateOver && distOver) return due.by === 'distance' ? dist : date;
    // Neither is past: lead with the nearer and name the other.
    if (due.by === 'distance') return `${dist}, or by ${shortYmd(due.ymd as Ymd, today)}`;
    return `${date}, or ${dist.replace(/^Due /, '')}`;
  }
  if (date) return date;
  if (dist) return dist;
  if (due.distance !== null) return `Due at ${distanceText(due.distance, unit)}`;
  return 'No date yet';
}

/**
 * Where a job's limit lies: the date, the odometer reading, or both. It sits beside the figure on a job's line,
 * which already says how long is left, so it never repeats it.
 */
export function dueWhere(due: Due, unit: DistanceUnit, today: Ymd, only?: 'date' | 'distance'): string {
  if (due.state === 'paused') return 'Put away';
  if (due.state === 'finished') return 'Done';
  const date = due.ymd !== null ? shortYmd(due.ymd, today) : null;
  const dist = due.distance !== null ? `at ${distanceText(due.distance, unit)}` : null;
  // On a narrow line there is room for one of the two: the one the figure beside it is counting.
  if (date && dist && only) return only === 'date' ? date : dist;
  if (date && dist) return `${dist} or ${date}`;
  if (date) return date;
  if (dist) return due.state === 'unknown' ? `${dist} · needs a reading` : dist;
  return 'Needs an odometer reading';
}

const UNIT_WORD: Record<Interval['unit'], string> = { day: 'day', week: 'week', month: 'month', year: 'year' };

export function intervalText(every: Interval): string {
  if (every.n === 1) return `Every ${UNIT_WORD[every.unit]}`;
  return `Every ${every.n} ${UNIT_WORD[every.unit]}s`;
}

/** "Every 3 months", "Every 5,000 mi or 6 months", "Every year on March 31", "Once". */
export function repeatText(job: Job, unit: DistanceUnit): string {
  const time = job.every ? intervalText(job.every) : null;
  const dist = job.everyDistance !== null ? `Every ${distanceText(job.everyDistance, unit)}` : null;
  if (time && dist) return `${dist} or ${time.replace(/^Every /, '')}`;
  if (time) {
    if (job.anchor === 'fixed' && job.startYmd && job.every && job.every.unit === 'year' && job.every.n === 1) {
      return `Every year on ${monthName(job.startYmd)} ${dayOfMonth(job.startYmd)}`;
    }
    return time;
  }
  if (dist) return dist;
  return 'Once';
}

export function leadText(days: number): string {
  if (days === 0) return 'On the day';
  if (days === 1) return 'The day before';
  if (days === 7) return 'A week before';
  if (days === 14) return 'Two weeks before';
  if (days === 30) return 'A month before';
  return `${days} days before`;
}
