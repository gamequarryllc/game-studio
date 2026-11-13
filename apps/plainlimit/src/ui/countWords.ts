// How What counts is explained, on its own screen and in setup. There is one
// list: what is ticked uses up the battery and locks when it is empty, and
// what is left unticked does neither.

export const COUNTS_LEAD = 'The apps you tick use up the battery and lock when it’s empty. Anything left unticked never counts and never locks.';

export const COUNTS_STEPS = ['Tap Choose apps.', 'Tap All Apps & Categories at the top, to count everything.', 'Untick what shouldn’t count. Maps is under Navigation.'] as const;

export const COUNTS_NOTE =
  'To leave out one app from a category you want counted, untick the category and tick its other apps one by one. Apps you install later in a category ticked that way won’t count until you tick them.';

export function pickedWords(picked: number): string {
  if (picked === 0) return 'Nothing is ticked yet, so nothing counts.';
  return picked === 1 ? '1 app or category is ticked.' : `${picked} apps and categories are ticked.`;
}
