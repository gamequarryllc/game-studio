// "Work for it": what the next stretch of time costs, in sums (free, the
// default) or push-ups (Pro), and the words the screens use for it.

import { topUpPlan } from './puzzle';
import { pushUpPlan, type EarnWith } from './pushUps';
import type { Settings } from './types';

export interface EarnStep {
  with: EarnWith;
  /** How many sums, or push-ups. */
  count: number;
  minutes: number;
}

/**
 * How time is earned, as saved. The store keeps it on push-ups only while
 * Pro is on (it goes back to sums when Pro is lost), so the screens that
 * cover an app, written by the phone from the saved settings, always say
 * what the app will ask for.
 */
export function earnWithOf(settings: Pick<Settings, 'earnWith'>): EarnWith {
  return settings.earnWith === 'pushUps' ? 'pushUps' : 'sums';
}

/** What the next top-up costs, given how many were already earned since the recharge. */
export function earnStep(earnWith: EarnWith, alreadyEarned: number): EarnStep {
  if (earnWith === 'pushUps') {
    const plan = pushUpPlan(alreadyEarned);
    return { with: earnWith, count: plan.count, minutes: plan.minutes };
  }
  const plan = topUpPlan(alreadyEarned);
  return { with: earnWith, count: plan.sums, minutes: plan.minutes };
}

/** "3 sums", "10 push-ups". */
export function countWords(step: Pick<EarnStep, 'with' | 'count'>): string {
  if (step.with === 'pushUps') return step.count === 1 ? '1 push-up' : `${step.count} push-ups`;
  return step.count === 1 ? '1 sum' : `${step.count} sums`;
}

/** "Solve 3 sums", "Do 10 push-ups". */
export function doWords(step: Pick<EarnStep, 'with' | 'count'>): string {
  return `${step.with === 'pushUps' ? 'Do' : 'Solve'} ${countWords(step)}`;
}
