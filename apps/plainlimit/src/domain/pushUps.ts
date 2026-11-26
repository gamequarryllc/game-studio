// Push-ups, the other way to earn more time (Pro): the owner asked on
// 2026-11-26 to "do x amount of pushups in order to unlock for more minutes as
// an alternative to the sum solving". Sums stay the default.
//
// The phone lies flat on the floor under the face, screen up. The front
// camera finds the face many times a second (the native module in
// modules/plainlimit-widgets/ios/PlainlimitPushUpsModule.swift) and reports
// only how big it looks: nothing is kept, nothing leaves the phone. Going down
// brings the face closer, so it looks bigger; pushing back up makes it small
// again. One trip down and back up is one push-up. The counting is all here,
// so it can be tested without a camera.

/** How someone earns more time once the battery is empty. Missing in saved settings reads as sums. */
export type EarnWith = 'sums' | 'pushUps';
export const EARN_WITH: readonly EarnWith[] = ['sums', 'pushUps'];

export interface PushUpPlan {
  /** How many push-ups must be done. */
  count: number;
  /** How many minutes that earns: the same as the sums would (topUpPlan). */
  minutes: number;
}

/**
 * What the next top-up costs in push-ups, given how many were already earned
 * since the recharge: 10 for 15 minutes, 15 for 10, 20 for 5, then 5 more each
 * time (25, 30...) for 5 minutes, until the recharge starts it again. The same
 * minutes as the sums (3, 5, 7, then +3), so the battery works the same either way.
 */
export function pushUpPlan(alreadyEarned: number): PushUpPlan {
  if (alreadyEarned <= 0) return { count: 10, minutes: 15 };
  if (alreadyEarned === 1) return { count: 15, minutes: 10 };
  return { count: 20 + 5 * (Math.floor(alreadyEarned) - 2), minutes: 5 };
}

/** How many push-ups "Try it" asks for, from Settings: enough to see the counting work. */
export const TRY_COUNT = 3;

/** One reading from the camera: when (ms), and how big the face looks (0 to 1), or null when no face is seen. */
export interface FaceSample {
  t: number;
  size: number | null;
}

/** Where a set of push-ups stands, as the screen shows it. */
export type PushUpPhase = 'looking' | 'up' | 'down';

export interface PushUpCount {
  reps: number;
  phase: PushUpPhase;
  /** The smallest the face has looked since the last push-up: the top, arms straight. */
  top: number;
  /** The biggest it has looked on the way down. */
  bottom: number;
  /** When the face last went down past the line, and when the last push-up was counted (ms). */
  downAt: number;
  repAt: number;
  /** The last few sizes seen, for a middle value that ignores one odd reading. */
  recent: number[];
  /** The last size used, and when a face was last seen (ms); null before any. */
  size: number | null;
  seenAt: number | null;
}

/**
 * Going down: the face must look this much bigger than at the top (about
 * two thirds of the way from arms straight to the floor, for a phone under
 * the face). A smaller dip is not a push-up.
 */
export const DOWN_RATIO = 1.6;
/**
 * Too close to be seen: a face that vanishes after it had grown this much was
 * not lost, it came down onto the phone. Counts as down.
 */
export const LOST_DOWN_RATIO = 1.3;
/** Back up: the face has shrunk back to within this share of the way from the top to the bottom. */
export const UP_SHARE = 0.4;
/** The shortest time at the bottom, and between two push-ups: quicker than these is a flicker, not a push-up. */
export const MIN_DOWN_MS = 120;
export const MIN_REP_MS = 450;
/** No face for this long and the screen says it can't see one. */
export const LOST_MS = 1500;
/**
 * No face found at all for this long since the camera started (a dark room,
 * the camera covered): the screen offers sums this time. Only then, so that
 * push-ups stay push-ups.
 */
export const NO_FACE_MS = 20000;

/** One push-up as the camera sees it, a reading every PREVIEW_STEP_MS: the web preview plays it for its stand-in camera. */
export const PREVIEW_PUSH_UP: readonly number[] = [0.2, 0.3, 0.42, 0.44, 0.42, 0.3, 0.2, 0.2];
export const PREVIEW_STEP_MS = 150;

export function startCount(): PushUpCount {
  return { reps: 0, phase: 'looking', top: 0, bottom: 0, downAt: 0, repAt: -Infinity, recent: [], size: null, seenAt: null };
}

function middle(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Takes one camera reading and returns where the push-ups stand now. */
export function countSample(count: PushUpCount, sample: FaceSample): PushUpCount {
  const { t } = sample;
  if (sample.size === null || !Number.isFinite(sample.size) || sample.size <= 0) {
    // Lost on the way down, after the face had grown: it came too close to be seen. That is the bottom.
    if (count.phase === 'up' && count.size !== null && count.size >= count.top * LOST_DOWN_RATIO) {
      return { ...count, phase: 'down', bottom: count.size, downAt: t, recent: [] };
    }
    return count;
  }
  const recent = [...count.recent, Math.min(1, sample.size)].slice(-3);
  const size = middle(recent);
  const seen = { ...count, recent, size, seenAt: t };
  if (count.phase === 'looking') return { ...seen, phase: 'up', top: size, bottom: size };
  if (count.phase === 'up') {
    const top = Math.min(count.top, size);
    if (size >= top * DOWN_RATIO) return { ...seen, phase: 'down', top, bottom: size, downAt: t };
    return { ...seen, top };
  }
  // Down: follow the bottom, and count the push-up once the face is nearly back to the top.
  const bottom = Math.max(count.bottom, size);
  const backUp = size <= count.top + (bottom - count.top) * UP_SHARE;
  if (backUp && t - count.downAt >= MIN_DOWN_MS && t - count.repAt >= MIN_REP_MS) {
    // The next push-up is measured from this top.
    return { ...seen, reps: count.reps + 1, phase: 'up', top: size, bottom: size, repAt: t };
  }
  if (backUp && t - count.repAt < MIN_REP_MS) {
    // Too quick to be a push-up: back to the top without counting.
    return { ...seen, phase: 'up', top: Math.min(count.top, size), bottom: size };
  }
  return { ...seen, bottom };
}

/** What the screen says under the number. */
export type PushUpHint = 'findFace' | 'lost' | 'goDown' | 'pushUp';

export function hintOf(count: PushUpCount, now: number): PushUpHint {
  if (count.phase === 'looking') return 'findFace';
  // At the bottom the face is often too close to be seen: that is not lost.
  if (count.phase === 'up' && count.seenAt !== null && now - count.seenAt > LOST_MS) return 'lost';
  return count.phase === 'down' ? 'pushUp' : 'goDown';
}

export const HINT_WORDS: Record<PushUpHint, string> = {
  findFace: 'Looking for your face',
  lost: 'Can’t see your face',
  goDown: 'Go down',
  pushUp: 'Push up',
};

/**
 * How far down the face is, 0 at the top and 1 at the line that counts as
 * down, for the bar beside the number.
 */
export function depthOf(count: PushUpCount): number {
  if (count.phase === 'looking' || count.size === null || count.top <= 0) return 0;
  if (count.phase === 'down') return 1;
  return Math.max(0, Math.min(1, (count.size - count.top) / (count.top * (DOWN_RATIO - 1))));
}
