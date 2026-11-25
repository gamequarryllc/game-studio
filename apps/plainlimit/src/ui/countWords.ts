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
 * Before the essentials are chosen. Apple's list opens twice (the phone's apps,
 * then the essentials), and each time its top line says what to tap. The
 * screen shows this as two short steps with pictures; these words are what is read out.
 */
export const CHOOSE_HOW = 'Apple’s list opens twice. First, as one-time setup, tick All Apps & Categories, then the check mark at the top right. Then tick only your essential apps: they are never counted and never locked.';
/** The first list was closed with nothing ticked. */
export const MISSED_APPS = 'Nothing was ticked. Tap Choose essentials again, tick All Apps & Categories at the top, then ✓ at the top right.';
/**
 * Apple's list hides its ✓ while a search is open, until the search's ✕ is
 * tapped (iOS 26; the owner looked for it after searching for an app,
 * 2026-11-25). Ticks made in the search are kept.
 */
export const AFTER_SEARCH = 'Searched? Tap ✕ by the search to get ✓ back.';
/** The head of the essentials card, read out. */
export function essentialsLabel(kept: number): string {
  if (kept === 0) return 'Always open: no essentials yet.';
  return `Always open: ${kept === 1 ? '1 essential app' : `${kept} essential apps`}, never counted.`;
}

/** The head of the card for every other app, read out. */
export function othersLabel(others: number): string {
  return `Everything else: ${others === 1 ? '1 app uses' : `${others} apps use`} your battery.`;
}

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

/** For a list made by an older version, still in use until the essentials are chosen. */
export const OLD_LIST_NOTE = 'Your list from before still applies until you choose your essentials.';

/**
 * The short value beside "Essentials" in Settings and setup. `kept` is how
 * many essentials are ticked, or null while a list from an older version is
 * still in use (then it names how many picks count, as 1.0.1 did; a bare "Set"
 * looked like a button asking to be set up).
 */
export function essentialsValue(picked: number, kept: number | null = null): string {
  if (picked < 0) return 'Your picks';
  if (kept !== null) return kept === 0 ? 'None' : kept === 1 ? '1 app' : `${kept} apps`;
  if (picked === 0) return 'Not chosen';
  return `${picked} count`;
}
