// How What counts is explained, on its own screen and in setup. There is one
// list: what is ticked uses up the battery and locks when it is empty, and
// what is left unticked does neither. The idea is to count the time wasters,
// not what a phone is for (calls, messages, maps).

export const COUNTS_LEAD =
  'Count the time wasters, not what the phone is for. The apps you tick use up the battery and lock when it’s empty. Anything left unticked never counts and never locks.';

/** The steps, the first naming the button as it reads: "Choose apps" with nothing ticked, "Change the apps" after. */
export const countsSteps = (picked: number) => [`Tap ${picked === 0 ? 'Choose apps' : 'Change the apps'}.`, ...COUNTS_STEPS.slice(1)];

export const COUNTS_STEPS = [
  'Tap Choose apps.',
  'Tap All Apps & Categories at the top, to count everything.',
  'Untick Navigation, so Maps never counts.',
  'Messages and FaceTime are in Social, with Instagram and Snapchat. To leave them out, untick Social, then open it and tick only the apps that should count.',
] as const;

export const COUNTS_NOTE =
  'Apps you install later in a category ticked one app at a time won’t count until you tick them. Whatever is ticked, iOS keeps the apps in its own Always Allowed list open (Phone, Messages, FaceTime and Maps, unless you changed it).';

export function pickedWords(picked: number): string {
  if (picked === 0) return 'Nothing is ticked yet, so nothing counts.';
  return picked === 1 ? '1 app or category is ticked.' : `${picked} apps and categories are ticked.`;
}
