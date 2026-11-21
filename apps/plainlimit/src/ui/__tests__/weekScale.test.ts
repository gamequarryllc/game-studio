import { keptScale, weekScale } from '../UsageReport';
import { GOAL_MAX, GOAL_MIN, GOAL_STEP } from '@/domain/settings';

describe("the 7-day chart's scale", () => {
  it('opens at the smallest scale that leaves room above the goal', () => {
    expect(weekScale(150)).toBe(4);
    expect(weekScale(180)).toBe(6);
    expect(weekScale(270)).toBe(8);
    expect(weekScale(GOAL_MAX)).toBe(12);
  });

  it('stays put while the goal moves inside it, so the bars are not drawn again', () => {
    // Setup opens at 3:00: the 6-hour scale. Down to the least and up to 6:00, never a new scale.
    for (let goal = GOAL_MIN; goal <= 6 * 60; goal += GOAL_STEP) expect(keptScale(6, goal)).toBe(6);
  });

  it('grows once the goal passes its top, and never shrinks', () => {
    expect(keptScale(6, 6 * 60 + GOAL_STEP)).toBe(12);
    expect(keptScale(4, 4 * 60 + GOAL_STEP)).toBe(8);
    expect(keptScale(12, GOAL_MIN)).toBe(12);
    expect(keptScale(8, GOAL_MIN)).toBe(8);
  });

  it('always has room for the goal', () => {
    for (const start of [4, 6, 8, 12] as const) {
      let hours = start;
      for (let goal = GOAL_MIN; goal <= GOAL_MAX; goal += GOAL_STEP) {
        hours = keptScale(hours, goal);
        expect(hours * 60).toBeGreaterThanOrEqual(goal);
      }
    }
  });
});
