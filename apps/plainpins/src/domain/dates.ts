import type { Ymd } from './types';

// Calendar days. A visit happened on a day of the calendar, not at an instant,
// so "Jul 4" stays Jul 4 wherever the phone travels afterwards.

const YMD_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidYmd(value: unknown): value is Ymd {
  if (typeof value !== 'string') return false;
  const m = YMD_RX.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** The local calendar date of a Date, as YYYY-MM-DD. */
export function toYmd(date: Date): Ymd {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayYmd(now: number): Ymd {
  return toYmd(new Date(now));
}

/** A Date at local noon on that calendar day (noon keeps it clear of daylight-saving edges). */
export function fromYmd(ymd: Ymd): Date {
  const m = YMD_RX.exec(ymd);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function parts(ymd: Ymd): [number, number, number] {
  const m = YMD_RX.exec(ymd);
  if (!m) return [1970, 1, 1];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function build(y: number, mo: number, d: number): Ymd {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days since a fixed day, counted on the calendar (so a daylight-saving change never makes a day 23 hours). */
function ordinal(ymd: Ymd): number {
  const [y, mo, d] = parts(ymd);
  return Math.round(Date.UTC(y, mo - 1, d) / 86_400_000);
}

function fromOrdinal(n: number): Ymd {
  const t = new Date(n * 86_400_000);
  return build(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole calendar days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: Ymd, b: Ymd): number {
  return ordinal(b) - ordinal(a);
}

export function addDays(ymd: Ymd, days: number): Ymd {
  return fromOrdinal(ordinal(ymd) + days);
}

/** Months later on the same day of the month, or on its last day when the month is shorter (Jan 31 + 1 = Feb 28). */
export function addMonths(ymd: Ymd, months: number): Ymd {
  const [y, mo, d] = parts(ymd);
  const index = y * 12 + (mo - 1) + months;
  const ny = Math.floor(index / 12);
  const nmo = (index % 12 + 12) % 12 + 1;
  return build(ny, nmo, Math.min(d, daysInMonth(ny, nmo)));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Mar 4, 2027". Written out by hand so it reads the same on every engine. */
export function displayYmd(ymd: Ymd | null): string {
  if (!ymd || !isValidYmd(ymd)) return '';
  const [y, mo, d] = parts(ymd);
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

/** "Mar 4" when it is this year, otherwise "Mar 4, 2027": a date in another year always says so. */
export function shortYmd(ymd: Ymd, today: Ymd): string {
  const [y, mo, d] = parts(ymd);
  return y === parts(today)[0] ? `${MONTHS[mo - 1]} ${d}` : `${MONTHS[mo - 1]} ${d}, ${y}`;
}

export function monthAbbr(ymd: Ymd): string {
  return MONTHS[parts(ymd)[1] - 1];
}

export function monthName(ymd: Ymd): string {
  return MONTHS_LONG[parts(ymd)[1] - 1];
}

export function dayOfMonth(ymd: Ymd): number {
  return parts(ymd)[2];
}

export function yearOf(ymd: Ymd): number {
  return parts(ymd)[0];
}

export function weekdayName(ymd: Ymd): string {
  const [y, mo, d] = parts(ymd);
  return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}
