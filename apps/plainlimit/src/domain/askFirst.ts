/**
 * "Second thought" (called Ask first in the code): a second, optional list of apps that ask for one sum every time
 * they are opened, whatever the battery says. Opening takes a moment of
 * thought instead of a reflex (the first thing many people do on picking up
 * the phone is open Instagram or TikTok without deciding to).
 *
 * How it sits beside the battery:
 * - The list is its own picks (`ASK_ID`), covered with its own screen. The
 *   phone shows that screen for an app on this list, and the battery's screens
 *   for every other covered app (the library picks a screen by the list an app
 *   is on, among lists named in a running activity: hence `ASK_WATCH`).
 * - One sum opens the whole list for `openMinutes`, then it is covered again.
 *   iOS never tells an app when another app is closed, so "every open" is
 *   really "every few minutes of use".
 * - An app on both lists still counts towards the battery. While the battery
 *   is empty (and no time has been earned), the battery's lock wins: the sum
 *   opens only the apps that don't count.
 */

/** The saved picks for this list. Also part of `ASK_WATCH`'s name, which is what lets the phone show this list's screen. */
export const ASK_ID = 'plask';
/** Runs all day while the list is on: nothing happens at its checkpoints; it is only there so the phone shows this list's screen. */
export const ASK_WATCH = 'plask';
/** The timer while the list is open; when it ends the list is covered again. */
export const ASK_OPEN = 'plaskopen';

export const OPEN_CHOICES = [5, 10, 15] as const;
export type OpenMinutes = (typeof OPEN_CHOICES)[number];

export interface AskFirst {
  on: boolean;
  openMinutes: OpenMinutes;
}

export const DEFAULT_ASK_FIRST: AskFirst = { on: false, openMinutes: 10 };

/** A saved copy read back, with anything missing or odd put right. */
export function repairAskFirst(raw: unknown): AskFirst {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const openMinutes = (OPEN_CHOICES as readonly number[]).includes(r.openMinutes as number) ? (r.openMinutes as OpenMinutes) : DEFAULT_ASK_FIRST.openMinutes;
  return { on: r.on === true, openMinutes };
}

/**
 * When an open stretch that starts at `now` ends: `openMinutes` later, on the
 * minute (the phone's timers go by whole minutes), never sooner than one whole
 * minute away, and never past a minute before the recharge, when the day's
 * covers are put back anyway.
 */
export function openUntil(now: Date, openMinutes: number, nextRechargeMs: number): Date {
  const minute = 60_000;
  const end = Math.ceil((now.getTime() + openMinutes * minute) / minute) * minute;
  return new Date(Math.max(Math.ceil((now.getTime() + minute) / minute) * minute, Math.min(end, nextRechargeMs - minute)));
}

/** Whether a sum also opens the apps that count towards the battery: not while it is empty with no earned time running. */
export function opensCountedApps(batteryEmpty: boolean, earnedTimeRunning: boolean): boolean {
  return !batteryEmpty || earnedTimeRunning;
}

/**
 * The words on the covering screen for an app on the list.
 * `{applicationOrDomainDisplayName}` is filled in by the phone. As on the
 * battery's screens, the main button is the safe one (close) and the second
 * is the way through.
 */
export function askShieldCopy(openMinutes: number): { title: string; line: string; primary: string; secondary: string } {
  return {
    title: 'Second thought',
    line: `One sum, then {applicationOrDomainDisplayName} opens for ${openMinutes} minutes.`,
    primary: 'Not now',
    secondary: 'Solve one sum',
  };
}

/** The notification the covering screen's button sends; tapping it opens the sum. */
export function askNotice(): { title: string; body: string; route: '/ask' } {
  return { title: 'Second thought', body: 'Tap to solve one sum and open it.', route: '/ask' };
}

/** The line under the sum, saying what solving it does. */
export function askLead(openMinutes: number, opensCounted: boolean, rechargeLabel: string): string {
  const what = `Your Second thought apps open for ${openMinutes} minutes, then ask again.`;
  return opensCounted ? what : `${what} Apps that also count stay locked until ${rechargeLabel}, as the battery is empty.`;
}
