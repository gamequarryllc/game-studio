// "Work for it": more time costs a few sums. Each time costs more and buys
// less, so the third top-up of a night is barely worth asking for.

export interface TopUpPlan {
  /** How many sums must be solved. */
  sums: number;
  /** How many minutes that earns. */
  minutes: number;
}

/**
 * What the next top-up costs, given how many were already earned since the
 * recharge: 3 sums for 15 minutes, 5 for 10, 7 for 5, then 3 more sums each
 * time (10, 13, 16...) for 5 minutes, with no end until the recharge starts
 * it again (the owner, 2026-11-17). Never a wall, always a little harder.
 */
export function topUpPlan(alreadyEarned: number): TopUpPlan {
  if (alreadyEarned <= 0) return { sums: 3, minutes: 15 };
  if (alreadyEarned === 1) return { sums: 5, minutes: 10 };
  return { sums: 7 + 3 * (Math.floor(alreadyEarned) - 2), minutes: 5 };
}

export interface Sum {
  a: number;
  b: number;
}

/** A small repeatable source of numbers, so tests see the same sums every time. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How hard the sums are. Normal is the free one; choosing another is Pro (the owner, 2026-11-17). */
export type SumLevel = 'easy' | 'normal' | 'hard';
export const SUM_LEVELS: readonly SumLevel[] = ['easy', 'normal', 'hard'];

/** Ones digits that add up past ten, so the answer needs a carry and cannot be read off at a glance. */
function carryingOnes(random: () => number): [number, number] {
  const onesA = 2 + Math.floor(random() * 8);
  const least = Math.max(1, 10 - onesA);
  const onesB = Math.min(9, least + Math.floor(random() * (10 - least)));
  return [onesA, onesB];
}

/**
 * One sum. Normal: two two-digit numbers with a carry (47 + 38).
 * Easy: a two-digit number and a single digit, with a carry (47 + 8).
 * Hard: a three-digit number and a two-digit one, with a carry (347 + 86).
 */
export function makeSum(random: () => number, level: SumLevel = 'normal'): Sum {
  const tensA = 1 + Math.floor(random() * 8);
  const tensB = 1 + Math.floor(random() * 8);
  const [onesA, onesB] = carryingOnes(random);
  if (level === 'easy') return { a: tensA * 10 + onesA, b: onesB };
  if (level === 'hard') {
    const hundreds = 1 + Math.floor(random() * 8);
    return { a: hundreds * 100 + tensA * 10 + onesA, b: tensB * 10 + onesB };
  }
  return { a: tensA * 10 + onesA, b: tensB * 10 + onesB };
}

export function makeSums(count: number, random: () => number, level: SumLevel = 'normal'): Sum[] {
  const out: Sum[] = [];
  while (out.length < count) {
    const next = makeSum(random, level);
    const last = out[out.length - 1];
    if (last && last.a === next.a && last.b === next.b) continue;
    out.push(next);
  }
  return out;
}

/** Whether what was typed is the answer. Only plain digits count. */
export function isRight(sum: Sum, typed: string): boolean {
  const text = typed.trim();
  if (!/^\d{1,4}$/.test(text)) return false;
  return Number(text) === sum.a + sum.b;
}
