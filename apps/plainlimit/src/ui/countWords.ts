// How Essentials is explained, on its own screen and in setup. The person
// ticks only their essentials: those never use up the battery and never lock.
// Everything else does both. (Up to build 89 it was the other way round, one
// list where everything was ticked and the essentials unticked; that put the
// lock on iOS's one-by-one method, which stops at 50 apps. The screen was
// called "What counts" until 1.0.1.)

export const COUNTS_LEAD =
  'Your essentials never count and never lock: calls, messages, maps, or any app you use as a tool. Everything else uses up the battery, and locks when it’s empty.';

/** Step 1: the phone shows Plainlimit its apps, once. Apple can only count apps it has been shown. */
export const SHOW_TITLE = 'Show Plainlimit your apps';
export const SHOW_HOW = 'Tap All Apps & Categories at the top of Apple’s list, then Done. The list stays on your phone.';
export function shownWords(apps: number): string {
  return `${apps === 1 ? '1 app' : `${apps} apps`} found.`;
}

/** Step 2: the essentials. */
export const KEEP_TITLE = 'Tick your essentials';
export const keepHow = (limit: number) => `Tick only the apps that should stay free and open, up to ${limit}. Search at the top finds an app fast.`;
export function keptWords(kept: number): string {
  if (kept === 0) return 'No essentials: every app counts, and locks when the battery is empty.';
  return `${kept === 1 ? '1 essential stays' : `${kept} essentials stay`} free. Everything else counts, and locks when the battery is empty.`;
}

/** Said when more essentials were ticked than iOS can keep open: the list is not kept. */
export function tooManyKept(ticked: number, limit: number): string {
  return `That was ${ticked} apps, and iOS can keep at most ${limit} open. Your list wasn’t changed. Tick fewer and try again.`;
}

export const COUNTS_NOTE =
  'An app you install later locks with the rest, but only counts once you tap Refresh the app list. iOS keeps Phone and the apps in its own Always Allowed list open whatever you pick.';

/** For a list made by an older version, still in use until both steps are done. */
export const OLD_LIST_NOTE = 'Your list from before still applies until you finish both steps.';

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
