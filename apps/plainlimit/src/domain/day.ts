// A "day" here runs from one recharge to the next, not midnight to midnight.
// Someone who recharges at 6:00 AM and runs out at 10:00 PM stays empty all
// night: that is the point.

const DAY_MINUTES = 24 * 60;

/** Keeps a time of day inside 0..1439. */
export function wrapMinute(minute: number): number {
  return ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function atMinute(day: Date, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minute / 60), minute % 60, 0, 0);
}

/** The most recent recharge at or before `now`, on the phone's own clock. */
export function periodStart(now: Date, rechargeMinute: number): Date {
  const minute = wrapMinute(rechargeMinute);
  const today = atMinute(now, minute);
  if (today.getTime() <= now.getTime()) return today;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return atMinute(yesterday, minute);
}

/** The next recharge after `now`. */
export function nextRecharge(now: Date, rechargeMinute: number): Date {
  const minute = wrapMinute(rechargeMinute);
  const today = atMinute(now, minute);
  if (today.getTime() > now.getTime()) return today;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return atMinute(tomorrow, minute);
}

/** A time of day the way an iPhone in the US writes it: "6:00 AM". */
export function clockLabel(minuteOfDay: number): string {
  const minute = wrapMinute(minuteOfDay);
  const h24 = Math.floor(minute / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** The same, for a moment in time. */
export function clockLabelOf(when: Date): string {
  return clockLabel(when.getHours() * 60 + when.getMinutes());
}

/** A length of time as hours and minutes: 130 is "2:10". */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** A goal in words: "3 hour day", "2.5 hour day", "30 minute day". */
export function goalLabel(goalMinutes: number): string {
  if (goalMinutes < 60) return `${String(Math.round(goalMinutes))} minute day`;
  const hours = Math.round((goalMinutes / 60) * 100) / 100;
  return `${String(hours)} hour day`;
}

/** How long until a moment, in the fewest words: "in 13 h 40 min", "in 40 min", "now". */
export function untilLabel(now: Date, then: Date): string {
  const minutes = Math.ceil((then.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}
