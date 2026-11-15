const YMD_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(value: string): boolean {
  const m = YMD_RX.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The local calendar date of a Date, as YYYY-MM-DD. */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A Date at local noon on that calendar day (noon keeps it clear of DST edges). */
export function fromYmd(ymd: string): Date {
  const m = YMD_RX.exec(ymd);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 4, 2021". Written out by hand so it reads the same on every engine. */
export function displayYmd(ymd: string | null): string {
  if (!ymd || !isValidYmd(ymd)) return '';
  const m = YMD_RX.exec(ymd)!;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "Nov 11, 2026" for a timestamp, in local time. */
export function displayTime(ms: number): string {
  return displayYmd(toYmd(new Date(ms)));
}

/** "today", "yesterday", "5 days ago", then the date. */
export function relativeDay(ms: number, now: number): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOf(now) - startOf(ms)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${displayTime(ms)}`;
}

const EXIF_RX = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OFFSET_RX = /^([+-])(\d{2}):?(\d{2})$/;

/**
 * When a photo was taken, from its EXIF record ("2021:03:04 14:22:05", with an
 * optional "+01:00" offset). Without an offset the time is read on the phone's
 * clock, as the camera wrote it. Anything unreadable, or later than `now`, is null.
 */
export function parseExifDate(value: unknown, offset: unknown, now: number): number | null {
  if (typeof value !== 'string') return null;
  const m = EXIF_RX.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || se > 60) return null;
  const off = typeof offset === 'string' ? OFFSET_RX.exec(offset.trim()) : null;
  let ms: number;
  if (off) {
    const minutes = (Number(off[2]) * 60 + Number(off[3])) * (off[1] === '-' ? -1 : 1);
    ms = Date.UTC(y, mo - 1, d, h, mi, se) - minutes * 60_000;
  } else {
    ms = new Date(y, mo - 1, d, h, mi, se).getTime();
  }
  // A camera with its clock set wrong can claim a time in the future; that's no evidence of anything.
  return Number.isFinite(ms) && ms <= now + 86_400_000 ? ms : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "UTC−05:00" for the phone's offset at that moment. */
export function utcOffsetLabel(ms: number): string {
  const minutes = -new Date(ms).getTimezoneOffset();
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** "Nov 15, 2026, 6:42 AM (UTC−05:00)": a moment that can't be mistaken for another, in local time. */
export function displayDateTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${displayTime(ms)}, ${hour12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'} (${utcOffsetLabel(ms)})`;
}
