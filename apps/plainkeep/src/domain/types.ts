// Everything the app keeps. It is one small document, saved as one file on the phone.

export type Id = string;
/** A calendar day in the phone's own time zone, as YYYY-MM-DD. */
export type Ymd = string;

/** What a thing is decides one thing only: whether it has an odometer. */
export type ThingKind = 'home' | 'vehicle' | 'other';

export const THING_ICONS = ['house', 'apartment', 'cabin', 'car', 'truck', 'motorcycle', 'camper', 'boat', 'bicycle', 'mower', 'tools', 'box'] as const;
export type ThingIcon = (typeof THING_ICONS)[number];

export interface Reading {
  ymd: Ymd;
  /** Whole miles or kilometres, whichever the person uses. */
  value: number;
}

/** Something that is looked after: a home, a car, a mower. */
export interface Thing {
  id: Id;
  kind: ThingKind;
  icon: ThingIcon;
  name: string;
  /** A line of the person's own: "2019, 2.5 L" or an address. It heads the service record. */
  detail: string;
  /** Odometer readings, oldest first. Only a vehicle has them. */
  readings: Reading[];
  createdAt: number;
}

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

export interface Interval {
  n: number;
  unit: IntervalUnit;
}

/** A job that comes round again: a filter, an oil change, a registration. */
export interface Job {
  id: Id;
  thingId: Id;
  name: string;
  /** What to remember next time: a filter size, a part number, a torque. */
  note: string;
  /** How often by the calendar; null when the job only goes by distance, or happens once. */
  every: Interval | null;
  /** How often by distance (vehicles only); null when it only goes by the calendar. */
  everyDistance: number | null;
  /**
   * 'done': the next one counts from the day the last one was done (a filter).
   * 'fixed': it stays on its calendar date however early or late it is done (a registration).
   */
  anchor: 'done' | 'fixed';
  /** The first due date. For a 'fixed' job, the date the whole schedule hangs from. */
  startYmd: Ymd | null;
  /** The odometer reading at which a distance job is first due, until it has been done once. */
  startDistance: number | null;
  /** Days of warning before it is due; null uses the app's setting. */
  leadDays: number | null;
  /** Put away for now (a mower in winter): not due, not reminded. */
  paused: boolean;
  createdAt: number;
}

/** One line of the log: something that was done (or deliberately skipped). */
export interface Entry {
  id: Id;
  thingId: Id;
  /** The job it belongs to; null for a one-off (a repair). It stays null-able so the log outlives a deleted job. */
  jobId: Id | null;
  /** What was done, in words. Copied from the job when it was logged. */
  title: string;
  ymd: Ymd;
  /** The odometer then, when known. */
  distance: number | null;
  /** What it cost, in cents; null when not noted. */
  cost: number | null;
  note: string;
  /** True when the job was skipped this time: the schedule moves on, and nothing was done. */
  skipped: boolean;
  createdAt: number;
}

export type DistanceUnit = 'mi' | 'km';

export interface Settings {
  currency: string;
  distanceUnit: DistanceUnit;
  /** Days of warning before something is due. */
  leadDays: number;
  /** When reminders arrive, on the phone's clock. */
  remindHour: number;
  remindMinute: number;
  /** The person asked for reminders. Whether the iPhone allows them is the iPhone's to say. */
  reminders: boolean;
  onboarded: boolean;
}

export interface Doc {
  format: 1;
  things: Thing[];
  jobs: Job[];
  entries: Entry[];
  settings: Settings;
  updatedAt: number;
}

export const LIMITS = {
  name: 60,
  detail: 120,
  note: 600,
  /** Cents: a hundred million in the main unit. */
  cents: 10_000_000_000,
  distance: 9_999_999,
  intervalN: 999,
  things: 200,
  jobs: 2000,
  entries: 20_000,
  readings: 2000,
  leadDays: 90,
} as const;

export const LEAD_CHOICES = [0, 1, 3, 7, 14, 30] as const;
