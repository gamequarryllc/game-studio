// The essentials, and when a change to them starts.
//
// An app made an essential stops counting what it used today, so ticking one
// that had a lot of use was a free way round the battery, the same hole as
// raising the goal (goal.ts; the owner, 2026-11-25: "I want it to behave the
// same as changing the daily goal"). So the rule is the goal's:
// - taking an app out of the essentials starts at once (stricter can't cheat);
// - putting back one the battery started with starts at once too, to undo that;
// - a new essential waits for the next recharge. The list as chosen is kept
//   whole and starts then; until then today keeps the apps both lists hold;
// - during setup, on its own day, and while an emergency pass runs, every
//   change starts at once (`goalFree`, and the pass as in `withGoal`).
//
// The same goes for the phone's whole list of apps (the first of Apple's two
// lists): an app left off it is locked but never counted, so unticking one
// there stopped its minutes counting as well. Dropping an app from that list
// waits for the recharge; a newly installed one is taken in at once.
//
// The lists are Apple's sealed picks: the app never learns which apps they
// hold, and only the phone can compare two of them. So the rule is written
// over `Lists`, which the phone answers on the real picks (screenTime.ts) and
// the tests on plain sets.

/** What the rule asks about two lists of apps. */
export interface Lists<L> {
  /** The apps in both. */
  both(a: L, b: L): L;
  /** The apps in either. */
  either(a: L, b: L): L;
  /** The apps in `a` that are not in `b`. */
  less(a: L, b: L): L;
  /** How many apps a list holds. */
  size(list: L): number;
}

export interface EssentialsChange<L> {
  /** The essentials from now. */
  today: L;
  /** The list this battery started with: today's can go back up to it, not past it. */
  start: L;
  /** The list as chosen, waiting for the next recharge. Null when nothing waits. */
  next: L | null;
}

/**
 * The essentials after the person chose `picked`, on a battery that started
 * with `start`. `free`: setup, its own day, or an emergency pass, when the
 * choice is today's whatever it is, and becomes the day's own start (so
 * taking one out and putting it back after the pass stays today's).
 */
export function withEssentials<L>(picked: L, start: L, free: boolean, lists: Lists<L>): EssentialsChange<L> {
  if (free) return { today: picked, start: picked, next: null };
  if (lists.size(lists.less(picked, start)) === 0) return { today: picked, start, next: null };
  return { today: lists.both(picked, start), start, next: picked };
}

/** What a recharge does: a list waiting for it starts, and the new battery starts with the list in force. */
export function essentialsAtRecharge<L>(today: L, next: L | null): { today: L; start: L } {
  const list = next ?? today;
  return { today: list, start: list };
}

export interface AppsChange<L> {
  /** The phone's apps as Plainlimit holds them from now: every one of them counts unless it is an essential. */
  today: L;
  /** The list as ticked, waiting for the next recharge because it leaves apps out. Null when nothing waits. */
  next: L | null;
}

/**
 * The phone's whole list of apps after it was ticked again as `picked`, when
 * it was `before`. Apps new to it count from now. Apps left off it go on
 * counting until the next recharge, unless the day is `free`.
 */
export function withApps<L>(picked: L, before: L, free: boolean, lists: Lists<L>): AppsChange<L> {
  if (free || lists.size(lists.less(before, picked)) === 0) return { today: picked, next: null };
  return { today: lists.either(before, picked), next: picked };
}
