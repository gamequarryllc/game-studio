// "Work for it": more time costs a few sums. Each time costs more and buys
// less, so the third top-up of a night is barely worth asking for.

export interface TopUpPlan {
  /** How many sums must be solved. */
  sums: number;
  /** How many minutes that earns. */
  minutes: number;
}

/** What the next top-up costs, given how many were already earned since the recharge. */
export function topUpPlan(alreadyEarned: number): TopUpPlan {
  if (alreadyEarned <= 0) return { sums: 3, minutes: 15 };
  if (alreadyEarned === 1) return { sums: 5, minutes: 10 };
  return { sums: 7, minutes: 5 };
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

/**
 * Two two-digit numbers whose ones add up past ten, so the answer needs a
 * carry and cannot be read off at a glance.
 */
export function makeSum(random: () => number): Sum {
  const tensA = 1 + Math.floor(random() * 8);
  const tensB = 1 + Math.floor(random() * 8);
  const onesA = 2 + Math.floor(random() * 8);
  const least = 10 - onesA;
  const onesB = Math.min(9, Math.max(1, least) + Math.floor(random() * (10 - Math.max(1, least))));
  return { a: tensA * 10 + onesA, b: tensB * 10 + onesB };
}

export function makeSums(count: number, random: () => number): Sum[] {
  const out: Sum[] = [];
  while (out.length < count) {
    const next = makeSum(random);
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
