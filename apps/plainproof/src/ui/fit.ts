// Small sums that decide whether text fits. No React here, so they can be tested.

/** About how wide a line of footnote-size text is, in points. Generous, so a "fits" answer can be trusted. */
export function footnoteWidth(text: string, fontScale = 1): number {
  return text.length * 6.9 * fontScale;
}

/**
 * Whether a set of "label   count" pairs fit side by side, each in an equal
 * share of `available` points with `gap` between the shares. When they don't,
 * the caller stacks them: a label must never run into its count or wrap.
 */
export function fitSideBySide(pairs: readonly (readonly [label: string, count: string])[], available: number, gap: number, fontScale = 1): boolean {
  if (pairs.length === 0) return true;
  const share = (available - gap * (pairs.length - 1)) / pairs.length;
  const breathing = 10;
  return pairs.every(([label, count]) => footnoteWidth(label, fontScale) + breathing + footnoteWidth(count, fontScale) <= share);
}
