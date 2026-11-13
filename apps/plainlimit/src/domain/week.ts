// The week view: the last seven batteries, each as far as it was used, and a
// few plain counts. Built from the history of finished days and today's day.
// Days the app never saw are shown as unknown, never guessed.

import { periodStart } from './day';
import type { DayState, DaySummary, Settings } from './types';

export type WeekState = 'counted' | 'partly' | 'off' | 'unknown';

export interface WeekColumn {
  /** The local date the battery was charged on, "2026-11-13". */
  date: string;
  /** "Mon", "Tue"... */
  weekday: string;
  today: boolean;
  usedMinutes: number;
  goalMinutes: number;
  state: WeekState;
  /** Counted throughout and stayed under the goal. Today never is, until it ends. */
  under: boolean;
  topUps: number;
}

export interface Week {
  columns: WeekColumn[];
  /** Finished days among the seven that were counted throughout. */
  countedDays: number;
  /** Of those, how many stayed under the goal. */
  underDays: number;
  /** Finished days in a row, ending yesterday, counted throughout and under the goal. */
  streak: number;
  /** Times extra time was earned across the seven, today included. */
  earned: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes());
}

function isUnder(h: DaySummary): boolean {
  return h.state === 'counted' && h.usedMinutes < h.goalMinutes;
}

export function weekView(history: readonly DaySummary[], day: DayState, settings: Settings, now: Date, counting: boolean): Week {
  const byDate = new Map(history.map((h) => [dateKey(new Date(h.start)), h]));
  const todayStart = periodStart(now, settings.rechargeMinute);
  const columns: WeekColumn[] = [];
  for (let k = 6; k >= 0; k--) {
    const start = shiftDays(todayStart, -k);
    const date = dateKey(start);
    const weekday = WEEKDAYS[start.getDay()];
    if (k === 0) {
      const state: WeekState = !counting ? 'off' : day.uncounted ? 'partly' : 'counted';
      columns.push({ date, weekday, today: true, usedMinutes: day.usedMinutes, goalMinutes: settings.goalMinutes, state, under: false, topUps: day.topUps });
      continue;
    }
    const h = byDate.get(date);
    columns.push(
      h
        ? { date, weekday, today: false, usedMinutes: h.usedMinutes, goalMinutes: h.goalMinutes, state: h.state, under: isUnder(h), topUps: h.topUps }
        : { date, weekday, today: false, usedMinutes: 0, goalMinutes: settings.goalMinutes, state: 'unknown', under: false, topUps: 0 },
    );
  }

  const finished = columns.filter((col) => !col.today);
  let streak = 0;
  for (let k = 1; ; k++) {
    const h = byDate.get(dateKey(shiftDays(todayStart, -k)));
    if (!h || !isUnder(h)) break;
    streak++;
  }
  return {
    columns,
    countedDays: finished.filter((col) => col.state === 'counted').length,
    underDays: finished.filter((col) => col.under).length,
    streak,
    earned: columns.reduce((sum, col) => sum + col.topUps, 0),
  };
}

/** The line under the columns, in plain words. */
export function weekLine(week: Week): string {
  if (week.countedDays === 0) return 'Your week fills in as the days go by.';
  const parts = [`Under your goal ${week.underDays} of the last ${week.countedDays} ${week.countedDays === 1 ? 'day' : 'days'}`];
  if (week.streak >= 2) parts.push(`${week.streak} in a row`);
  return `${parts.join(', ')}.`;
}

/** The second line: how often more time was earned. */
export function earnedLine(week: Week): string | null {
  if (week.earned === 0) return null;
  return week.earned === 1 ? 'Earned extra time once this week.' : `Earned extra time ${week.earned} times this week.`;
}
