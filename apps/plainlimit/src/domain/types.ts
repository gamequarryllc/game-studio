// The words the rest of the app is written in.

import type { AskFirst } from './askFirst';
import type { SumLevel } from './puzzle';
import type { EarnWith } from './pushUps';
import type { PassRecord } from './record';

/** Which apps drain the battery. */
export type CountMode = 'everything' | 'timeWasters' | 'custom';

/** What happens once the battery is empty. */
export type EmptyLevel = 'warn' | 'work' | 'locked';

export interface Settings {
  /** Today's daily goal, in minutes of screen time: the one the battery, the phone's checkpoints and the widget go by. */
  goalMinutes: number;
  /** A higher goal chosen today, which starts at the next recharge (goal.ts). Missing when none is waiting. */
  nextGoalMinutes?: number;
  /** When the battery refills, as minutes after midnight (360 = 6:00 AM). */
  rechargeMinute: number;
  /** A new recharge time chosen during this battery (Pro), which starts once it ends (recharge.ts). Missing when none is waiting. */
  nextRechargeMinute?: number;
  /** No longer used: what counts is the one list ticked in Apple's picker. Kept so older saved copies still read. */
  countMode: CountMode;
  emptyLevel: EmptyLevel;
  /** No longer used: there is no always-allowed list. Apps left unticked never lock. Kept so older saved copies still read. */
  allowed: string[];
  /** The "Ask first" list: apps that ask for one sum every time they open (askFirst.ts). Missing in copies saved before it, which read as off. */
  askFirst?: AskFirst;
  /** How hard the sums are. Missing in copies saved before it, which read as normal. Anything but normal needs Pro (pro.ts). */
  sumLevel?: SumLevel;
  /** The person's own words on the empty battery's lock screen (Pro). Missing or empty: none. */
  lockMessage?: string;
  /** How more time is earned once the battery is empty: sums, or push-ups (Pro). Missing reads as sums. */
  earnWith?: EarnWith;
}

/** One battery's worth of time: from one recharge to the next. */
export interface DayState {
  /** When this battery was charged (ISO time). */
  periodStart: string;
  /** Minutes used since then, as far as the app knows. */
  usedMinutes: number;
  /** How many times more time was earned since the recharge. */
  topUps: number;
  /** Earned time runs until here (ISO time), or null when none is running. */
  unlockedUntil: string | null;
  /**
   * Some of this day went uncounted: counting was off for a while, Screen Time
   * access was taken away, or the phone miscounted. Such a day is not claimed
   * as a day under the goal.
   */
  uncounted: boolean;
  /** The goal this battery started with: today's goal can go back up to it, not past it (goal.ts). Missing reads as today's goal. */
  startGoalMinutes?: number;
  /** The battery setup finished in: until the next recharge, the goal changes freely (goal.ts). */
  firstDay?: boolean;
  /**
   * The phone has been through this battery's start for the essentials: a
   * list waiting for the recharge was started, and the list in force noted as
   * the one the battery started with (essentials.ts). Missing on a battery
   * the app has not looked at yet.
   */
  essentialsNoted?: boolean;
}

/** What is kept of a finished day, for the week view. */
export interface DaySummary {
  /** When its battery was charged (ISO time). */
  start: string;
  goalMinutes: number;
  /** At least this many minutes were used. */
  usedMinutes: number;
  topUps: number;
  /** Counted throughout; counted only in part; or not counted at all. */
  state: 'counted' | 'partly' | 'off';
}

export interface Doc {
  v: 1;
  settings: Settings;
  day: DayState;
  /** Whether the person has real counting turned on. Null only for a copy saved before this was kept, until the phone is asked. */
  watching: boolean | null;
  /** The first-run setup has been through. */
  setupDone: boolean;
  /** Finished days, oldest first, at most HISTORY_DAYS of them. */
  history: DaySummary[];
  /** Emergency passes and the record (record.ts). Missing in copies saved before it; made on load. */
  record?: PassRecord;
}
