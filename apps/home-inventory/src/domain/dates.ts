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
