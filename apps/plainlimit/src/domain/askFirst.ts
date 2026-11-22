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
 * - Or, with "While I use it" (`whileInUse`), one sum keeps the list open for
 *   as long as it is being used, and it is covered again `IDLE_MINUTES` after
 *   the last minute of use. The owner, 2026-11-22: some people want to stay
 *   in an app as long as they like, but it must not then be open all day;
 *   ideally it asks again every time the phone is picked up. iOS never tells
 *   an app that the phone was locked or picked up, so this is the nearest
 *   thing: a timer that every minute of use puts off (see `ASK_IDLE`).
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
/**
 * "While I use it": the timer whose START is the moment the list is covered
 * again. Every minute of use (`ASK_USE`) stops it and starts it afresh, so it
 * only ever starts once the list has gone unused for `IDLE_MINUTES`. It is the
 * start that covers, never the end: the phone reports an end for a timer that
 * is stopped while it runs, and one that has not started yet can be put off
 * without anything being reported.
 */
export const ASK_IDLE = 'plaskidle';
/** "While I use it": counts the minutes the list is used after a sum. Each one puts `ASK_IDLE` off. */
export const ASK_USE = 'plaskuse';

export const OPEN_CHOICES = [5, 10, 15] as const;
export type OpenMinutes = (typeof OPEN_CHOICES)[number];
/** How long one sum opens the list for: a number of minutes, or 'use' for "While I use it". */
export type OpenChoice = OpenMinutes | 'use';

/** "While I use it": the list is covered again this long after its last minute of use. */
export const IDLE_MINUTES = 2;
/** "While I use it": the longest one sum keeps the list open, however much it is used. Then it asks once more. */
export const USE_CAP_MINUTES = 60;
/** "While I use it": how long an `ASK_IDLE` timer runs once it has started (see `idleWindow`). */
export const IDLE_SPAN_MINUTES = 23 * 60;

export interface AskFirst {
  on: boolean;
  /** The minutes one sum opens the list for. Kept as the last number chosen while `whileInUse` is on. */
  openMinutes: OpenMinutes;
  /** "While I use it": open for as long as the list is being used, instead of for `openMinutes`. */
  whileInUse?: boolean;
}

export const DEFAULT_ASK_FIRST: AskFirst = { on: false, openMinutes: 10 };

/** After Apple's list closes with `picked` apps in it: picking apps turns the list on, and an empty list turns it off. */
export function onAfterPicking(picked: number): boolean {
  return picked > 0;
}

/**
 * What the switch on the Second thought screen shows: on only with something
 * picked, as nothing asks first otherwise. Where nothing can be picked (the
 * web preview) it shows the setting as saved.
 */
export function askShownOn(ask: AskFirst, picked: number, canPick: boolean): boolean {
  return ask.on && (picked > 0 || !canPick);
}

/**
 * The line under On or Off on the Second thought screen: what that means just
 * now. Off with nothing picked says how to turn it on, as the switch then
 * opens Apple's list.
 */
export function askStateLine(on: boolean, picked: number, canPick: boolean): string {
  if (!on) return canPick && picked === 0 ? 'Pick apps and it turns on' : 'Apps open as usual';
  if (!canPick) return 'Your apps ask first';
  return picked === 1 ? '1 app asks first' : `${picked} apps ask first`;
}

/** A saved copy read back, with anything missing or odd put right. */
export function repairAskFirst(raw: unknown): AskFirst {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const openMinutes = (OPEN_CHOICES as readonly number[]).includes(r.openMinutes as number) ? (r.openMinutes as OpenMinutes) : DEFAULT_ASK_FIRST.openMinutes;
  return r.whileInUse === true ? { on: r.on === true, openMinutes, whileInUse: true } : { on: r.on === true, openMinutes };
}

/** Which choice is made on the Second thought screen. */
export function openChoice(ask: AskFirst): OpenChoice {
  return ask.whileInUse === true ? 'use' : ask.openMinutes;
}

/** What choosing `choice` changes. "While I use it" keeps the minutes as they were, for when a number is chosen again. */
export function openChange(choice: OpenChoice): Partial<AskFirst> {
  return choice === 'use' ? { whileInUse: true } : { openMinutes: choice, whileInUse: false };
}

/** The longest one sum opens the list for, in minutes: the number chosen, or the cap of "While I use it". */
export function openSpan(ask: AskFirst): number {
  return ask.whileInUse === true ? USE_CAP_MINUTES : ask.openMinutes;
}

/** The choice in a few words, for its tile in Settings: "10 min", or "while in use". */
export function openShort(ask: AskFirst): string {
  return ask.whileInUse === true ? 'while in use' : `${ask.openMinutes} min`;
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

/** A time of day, as the phone's timers take it. */
export interface AskClock {
  hour: number;
  minute: number;
}

function clockAt(ms: number): AskClock {
  const at = new Date(ms);
  return { hour: at.getHours(), minute: at.getMinutes() };
}

/**
 * "While I use it": the stretch the phone counts the list's use over, after a
 * sum at `now` that opens it until `until` at the latest. It has already
 * begun (a minute ago, or sooner where the phone's shortest stretch needs
 * it), so use counts from the sum on, and it ends with the open stretch.
 */
export function usedWindow(now: Date, until: Date, shortestMinutes: number): { start: AskClock; end: AskClock } {
  const minute = 60_000;
  const start = Math.min(now.getTime() - minute, until.getTime() - (shortestMinutes + 1) * minute);
  return { start: clockAt(start), end: clockAt(until.getTime()) };
}

/**
 * "While I use it": the first timer after a sum at `now`. It starts
 * `IDLE_MINUTES` later, on the minute (the phone's timers go by whole
 * minutes), and runs for most of a day: the phone reports a start the first
 * time it is used during the stretch, so the stretch has to still be running
 * whenever the phone is next picked up.
 */
export function idleWindow(now: Date): { start: AskClock; end: AskClock } {
  const minute = 60_000;
  const start = Math.ceil((now.getTime() + IDLE_MINUTES * minute) / minute) * minute;
  return { start: clockAt(start), end: clockAt(start + IDLE_SPAN_MINUTES * minute) };
}

/** "While I use it": the name of the checkpoint at `minutes` of use. */
export function tickOfUse(minutes: number): string {
  return `use${String(minutes).padStart(2, '0')}`;
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
 *
 * The phone picks this screen over the battery's for an app on both lists,
 * and the battery usually runs out while Plainlimit is closed, when nothing
 * can change these words. So the usual words say that the sum needs charge,
 * and `batteryEmpty` (written when Plainlimit sees the battery empty) says
 * plainly that apps that count stay locked.
 */
export function askShieldCopy(open: number | 'use', rechargeLabel: string, batteryEmpty = false): { title: string; line: string; primary: string; secondary: string } {
  if (batteryEmpty) {
    return {
      title: "Battery's empty",
      line: `Apps that count stay locked until ${rechargeLabel}. One sum still opens the Second thought apps that don't count.`,
      primary: 'Close this app',
      secondary: 'Solve one sum',
    };
  }
  return {
    title: 'Second thought',
    line:
      open === 'use'
        ? 'One sum, then {applicationOrDomainDisplayName} stays open while you use it and your battery has charge.'
        : `One sum, then {applicationOrDomainDisplayName} opens for ${open} minutes, while your battery has charge.`,
    primary: 'Not now',
    secondary: 'Solve one sum',
  };
}

/** The notification the covering screen's button sends; tapping it opens the sum. */
export function askNotice(): { title: string; body: string; route: '/ask' } {
  return { title: 'Second thought', body: 'Tap to solve one sum and open it.', route: '/ask' };
}

/** The line under the sum, saying what solving it does. */
export function askLead(open: number | 'use', opensCounted: boolean, rechargeLabel: string): string {
  const what = open === 'use' ? 'Your Second thought apps stay open while you use them, then ask again.' : `Your Second thought apps open for ${open} minutes, then ask again.`;
  return opensCounted ? what : `${what} Apps that also count stay locked until ${rechargeLabel}, as the battery is empty.`;
}

/**
 * What the sum's screen says once the list is open: a heading, and the line
 * under it. `byHand` adds where to go next; it is left out when the screen has
 * a button that opens the app itself (src/domain/appLinks.ts).
 */
export function askOpened(open: number | 'use', untilLabel: string, byHand = true): { title: string; line: string } {
  const next = byHand ? ' Go back to the one you wanted.' : '';
  if (open === 'use') {
    return {
      title: 'Open while you use it',
      line: `Your Second thought apps stay open while you’re in them, and ask again about ${IDLE_MINUTES} minutes after you stop.${next}`,
    };
  }
  return { title: `Open for ${open} minutes`, line: `Your Second thought apps are open until ${untilLabel}.${next}` };
}
