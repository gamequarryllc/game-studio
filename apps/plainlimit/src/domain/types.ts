// The words the rest of the app is written in.

/** Which apps drain the battery. */
export type CountMode = 'everything' | 'timeWasters' | 'custom';

/** What happens once the battery is empty. */
export type EmptyLevel = 'warn' | 'work' | 'locked';

export interface Settings {
  /** The daily goal, in minutes of screen time. */
  goalMinutes: number;
  /** When the battery refills, as minutes after midnight (360 = 6:00 AM). */
  rechargeMinute: number;
  countMode: CountMode;
  emptyLevel: EmptyLevel;
  /** Apps that still open when the battery is empty, by the name shown to the person. */
  allowed: string[];
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
}
