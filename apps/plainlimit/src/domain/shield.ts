// The words on the screens that cover an app. Kept here, away from any
// drawing, so the preview and the iPhone's own screens say the same thing.

import { clockLabel, durationLabel } from './day';
import { topUpPlan } from './puzzle';
import type { Settings } from './types';

export interface ShieldCopy {
  title: string;
  line: string;
  /** The safe button: always "close". */
  primary: string;
  /** The way through, when there is one. */
  secondary: string | null;
}

/** "3 hours", "2 hours 30 minutes", "45 minutes". */
export function goalInWords(goalMinutes: number): string {
  const h = Math.floor(goalMinutes / 60);
  const m = goalMinutes % 60;
  const hours = h === 0 ? '' : h === 1 ? '1 hour' : `${h} hours`;
  const minutes = m === 0 ? '' : `${m} minutes`;
  return [hours, minutes].filter(Boolean).join(' ') || `${durationLabel(goalMinutes)}`;
}

function allowedTail(allowed: readonly string[]): string {
  if (allowed.length === 0) return '';
  if (allowed.length === 1) return ` ${allowed[0]} still opens.`;
  return ` ${allowed.slice(0, -1).join(', ')} and ${allowed[allowed.length - 1]} still open.`;
}

/** Shown on the last cell, and again shortly before the end. */
export function warningCopy(settings: Settings): ShieldCopy {
  return {
    title: 'Last cell',
    line: `Your battery is nearly out. It recharges at ${clockLabel(settings.rechargeMinute)}.`,
    primary: 'Keep going',
    secondary: 'Close this app',
  };
}

/** Shown once the battery is empty; what it offers depends on the level chosen in Settings. */
export function emptyCopy(settings: Settings, topUpsSoFar: number): ShieldCopy {
  const at = clockLabel(settings.rechargeMinute);
  if (settings.emptyLevel === 'warn') {
    return { title: "Battery's empty", line: `You're past your ${goalInWords(settings.goalMinutes)}. It recharges at ${at}.`, primary: 'Close this app', secondary: 'Keep going anyway' };
  }
  if (settings.emptyLevel === 'work') {
    const plan = topUpPlan(topUpsSoFar);
    return {
      title: "Battery's empty",
      line: `Solve ${plan.sums} sums for ${plan.minutes} more minutes, or wait until it recharges at ${at}.`,
      primary: 'Close this app',
      secondary: 'I need more time',
    };
  }
  return { title: "Battery's empty", line: `Locked until it recharges at ${at}.${allowedTail(settings.allowed)}`, primary: 'Close this app', secondary: null };
}
