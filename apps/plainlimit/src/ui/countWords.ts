// How Essentials is explained, on its own screen and in setup. The person
// ticks only their essentials: those never use up the battery and never lock.
// Everything else does both. (Up to build 89 it was the other way round, one
// list where everything was ticked and the essentials unticked; that put the
// lock on iOS's one-by-one method, which stops at 50 apps. The screen was
// called "What counts" until 1.0.1.)

/** Under the Essentials title. The icons and the count below it say the rest (the owner found a paragraph here wordy, 2026-11-25). */
export const COUNTS_LEAD = 'Never counted. Never locked.';

/** The same in few words, for setup, under the heading Your essentials, where the pictures say the rest. */
export const COUNTS_SHORT = 'These never count and never lock.';

/**
 * Before the essentials are chosen. Apple's list opens once, and its top line
 * says what to tap. The screen shows this as a short step with pictures;
 * these words are what is read out. (Up to 1.1's first builds the list opened
 * twice: once with everything ticked, so the app had the phone's apps to
 * count by name. The count is now everything, less the essentials.)
 */
export const CHOOSE_HOW = 'Apple’s list opens. Tick only your essential apps, then the check mark at the top right. They are never counted and never locked. Everything else uses your battery.';
/** Before the essentials are chosen, on Today and on their own screen: what holds until then. */
export const EVERYTHING_COUNTS = 'Until you choose, every app uses your battery.';
/** The head of the essentials card, read out. */
export function essentialsLabel(kept: number): string {
  if (kept === 0) return 'Always open: no essentials yet.';
  return `Always open: ${kept === 1 ? '1 essential app' : `${kept} essential apps`}, never counted.`;
}

/** The head of the card for every other app, read out. The app is never told which apps those are, nor how many. */
export const OTHERS_LABEL = 'Everything else uses your battery.';

/**
 * A new essential waits for the next recharge (domain/essentials.ts). Its
 * card on the Essentials screen says when it starts, with the apps' own
 * icons. `day` is "today", "tomorrow" or a weekday (`dayWord`); `recharge`
 * is that recharge's time ("6:00 AM"). In the small hours the recharge is
 * today's, so the card names the time instead of the day.
 */
export function joinsTitle(day: string, recharge: string): string {
  if (day === 'today') return `Joining at ${recharge}`;
  return day === 'tomorrow' ? 'Joining tomorrow' : `Joining on ${day}`;
}

/** Under the icons of that card, beside the essentials' "Never counted": until then these count like any other app. */
export function joinsLine(day: string, recharge: string): string {
  return day === 'today' ? 'Counted until then' : `Counted until ${recharge}`;
}

/** That card, read out. */
export function joinsLabel(joining: number, day: string, recharge: string): string {
  const when = day === 'today' ? `at ${recharge}` : day === 'tomorrow' ? `tomorrow at ${recharge}` : `on ${day} at ${recharge}`;
  return joining === 1 ? `1 app becomes an essential ${when}. It is counted until then.` : `${joining} apps become essentials ${when}. They are counted until then.`;
}

/** Beside the count on Settings' Essentials row while some wait: "14 apps, 2 more tomorrow". */
export function joinsShort(joining: number, day: string, recharge: string): string {
  return `${joining} more ${day === 'today' ? `at ${recharge}` : day === 'tomorrow' ? 'tomorrow' : `on ${day}`}`;
}

/** Said when more essentials were ticked than iOS can keep open: the list is not kept. */
export function tooManyKept(ticked: number, limit: number): string {
  return `That was ${ticked} apps, and iOS can keep at most ${limit} open. Your list wasn’t changed. Tick fewer and try again.`;
}

/** In place of the buttons while the battery is empty. */
export const ESSENTIALS_LOCKED = 'Locked while the battery is empty';

/**
 * The short value beside "Essentials" in Settings and setup. `kept` is how
 * many essentials are ticked, or null when they have not been chosen yet
 * (then everything counts); `known` is false where there is no phone to ask
 * (the preview).
 */
export function essentialsValue(kept: number | null, known = true): string {
  if (!known) return 'Your picks';
  if (kept === null) return 'Not chosen';
  return kept === 0 ? 'None' : kept === 1 ? '1 app' : `${kept} apps`;
}
