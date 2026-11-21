import { WEEK, aboveChart, goalY, weekScale } from '../UsageReport';
import { GOAL_MAX, GOAL_MIN, GOAL_STEP } from '@/domain/settings';

describe("the 7-day chart's scale", () => {
  it('opens at the smallest scale that leaves room above the goal', () => {
    expect(weekScale(150)).toBe(4);
    expect(weekScale(180)).toBe(6);
    expect(weekScale(270)).toBe(8);
    expect(weekScale(GOAL_MAX)).toBe(12);
  });

  it('places every goal the stepper can reach inside the chart, so the bars never have to be drawn again', () => {
    // Setup opens at 3:00: the 6-hour scale, kept whatever the stepper does.
    const hours = weekScale(180);
    for (let goal = GOAL_MIN; goal <= GOAL_MAX; goal += GOAL_STEP) {
      const y = goalY(goal, hours);
      expect(y).toBeGreaterThanOrEqual(WEEK.top);
      expect(y).toBeLessThanOrEqual(WEEK.height - WEEK.bottom);
    }
  });

  it('keeps a goal past the top at the top, marked as above the chart', () => {
    expect(aboveChart(6 * 60, 6)).toBe(false);
    expect(goalY(6 * 60, 6)).toBe(WEEK.top);
    expect(aboveChart(6 * 60 + GOAL_STEP, 6)).toBe(true);
    expect(goalY(6 * 60 + GOAL_STEP, 6)).toBe(WEEK.top);
    expect(goalY(GOAL_MAX, 6)).toBe(WEEK.top);
  });

  it('moves the line with every step below the top', () => {
    for (let goal = GOAL_MIN; goal < 6 * 60; goal += GOAL_STEP) expect(goalY(goal + GOAL_STEP, 6)).toBeLessThan(goalY(goal, 6));
  });
});
