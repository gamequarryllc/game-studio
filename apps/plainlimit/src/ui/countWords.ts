// How Essentials is explained, on its own screen and in setup. There is one
// list in Apple's picker: what is ticked uses up the battery and locks when it
// is empty, and what is left unticked (the essentials) does neither. The idea:
// using the phone as a tool (calls, messages, maps) never costs battery.
// (The screen was called "What counts" until 1.0.1; the picks are the same.)

export const COUNTS_LEAD =
  'Your essentials never count, and you choose them: calls, messages, maps, or any app you use as a tool. Everything you tick uses up the battery, and locks when it’s empty.';

/** The steps, the first naming the button as it reads ("Choose apps", "Change the apps", "Pick again"). */
export const countsSteps = (button: string) => [`Tap ${button}.`, ...COUNTS_STEPS.slice(1)];

export const COUNTS_STEPS = [
  'Tap Choose apps.',
  'Tap All Apps & Categories at the top, so everything counts.',
  // Apple's list has no Navigation category: Maps is under Travel (seen in Screen Time on Nov 15, and Maps counted on Nov 16 with Travel ticked).
  'Now untick your essentials. Untick Travel, so Maps is free.',
  'Messages and FaceTime are in Social, with Instagram and Snapchat. To keep them free, untick Social, then open it and tick only the apps that should count.',
] as const;

export const COUNTS_NOTE =
  'Apps you install later in a category ticked one app at a time won’t count until you tick them. Whatever is ticked, iOS keeps the apps in its own Always Allowed list open (Phone, Messages, FaceTime and Maps, unless you changed it).';

export function pickedWords(picked: number): string {
  if (picked === 0) return 'Nothing is ticked yet, so nothing counts.';
  return `${picked === 1 ? '1 app or category counts' : `${picked} apps and categories count`}. Everything left unticked is an essential, and free.`;
}

/**
 * The short value beside "Essentials" in Settings and setup. It names how many
 * picks count, so it can't be read as "not set yet". (1.0.1 first said a bare
 * "Set", which looked like a button asking to be set up; 1.0.0 said "13 ticked".)
 */
export function essentialsValue(picked: number): string {
  if (picked < 0) return 'Your picks';
  if (picked === 0) return 'Not chosen';
  return `${picked} count`;
}

/** The warning when more single apps are ticked than iOS will lock, and how that usually happens. */
export function tooManyWords(singleApps: number, limit: number): string {
  return `${singleApps} apps are ticked one by one, and iOS locks at most ${limit}, so most of them won’t lock. Pick again, and untick whole categories where you can.`;
}
