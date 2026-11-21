// The shape of everything Plainproof keeps. One document, stored on the phone.

export const DOC_VERSION = 1;

export type Id = string;

export const ROOM_ICONS = [
  'sofa',
  'bed',
  'kitchen',
  'dining',
  'bath',
  'desk',
  'kids',
  'laundry',
  'garage',
  'storage',
  'outdoor',
  'hall',
  'box',
] as const;
export type RoomIcon = (typeof ROOM_ICONS)[number];

export interface Room {
  id: Id;
  name: string;
  icon: RoomIcon;
  createdAt: number;
  /** Walk-through videos of the room, the way insurers suggest documenting a home. */
  videos: Video[];
}

/** A video file kept in the app. */
export interface Video {
  id: Id;
  /** Length in milliseconds, when the phone said. */
  durationMs: number | null;
  /** Size of the file in bytes. */
  bytes: number;
  /** When it was recorded (ms), when known. */
  takenAt: number | null;
  addedAt: number;
  /** The file's extension: mov or mp4. */
  ext: 'mov' | 'mp4';
}

/** A document kept with a place: the insurance policy, as a PDF or a photo of each page. */
export interface Attachment {
  id: Id;
  /** The name it had when it was added, shown in the list. */
  name: string;
  kind: 'pdf' | 'image';
  bytes: number;
  addedAt: number;
}

export const LOSS_STATUSES = ['stolen', 'damaged', 'destroyed', 'lost'] as const;
export type LossStatus = (typeof LOSS_STATUSES)[number];
export const LOSS_LABELS: Record<LossStatus, string> = {
  stolen: 'Stolen',
  damaged: 'Damaged',
  destroyed: 'Destroyed',
  lost: 'Lost',
};

export const LOSS_CAUSES = ['fire', 'smoke', 'water', 'storm', 'theft', 'vandalism', 'accident', 'other'] as const;
export type LossCause = (typeof LOSS_CAUSES)[number];
export const LOSS_CAUSE_LABELS: Record<LossCause, string> = {
  fire: 'Fire',
  smoke: 'Smoke',
  water: 'Water or flood',
  storm: 'Storm or wind',
  theft: 'Theft or break-in',
  vandalism: 'Vandalism',
  accident: 'Accident',
  other: 'Something else',
};

/** One item in a claim: what happened to it, and a note for the adjuster. */
export interface ClaimItem {
  itemId: Id;
  loss: LossStatus;
  note: string;
}

/**
 * A claim being made for this place. A place can have several open at once
 * (a break-in in March and a burst pipe in May are two claims, often with two
 * insurers' adjusters), each with its own items, details and package.
 */
export interface Claim {
  id: Id;
  /** A name to tell claims apart ("Kitchen fire"). Empty: one is made from the cause and date. */
  name: string;
  openedAt: number;
  /** YYYY-MM-DD */
  lossDate: string | null;
  cause: LossCause | null;
  /** The number the insurer gave the claim. */
  claimNumber: string;
  /** What happened, in the person's words. */
  description: string;
  /** The items it covers, each once. */
  items: ClaimItem[];
}

/** An item as it appears in one claim's schedule: the item, with what happened to it in that claim. */
export type ClaimedItem = Item & { loss: LossStatus; lossNote: string };

export interface Policy {
  /** The policy's limit for personal property (contents), in cents. */
  contentsLimitCents: number | null;
  deductibleCents: number | null;
  /** Lower limits the policy sets for some kinds of things (jewelry, often), in cents. */
  categoryLimits: Partial<Record<Category, number>>;
  /** The policy itself. */
  documents: Attachment[];
}

export const CATEGORIES = [
  'electronics',
  'appliances',
  'furniture',
  'jewelry',
  'firearms',
  'silver',
  'collectibles',
  'business',
  'rugs',
  'clothing',
  'tools',
  'kitchenware',
  'art',
  'sports',
  'music',
  'books',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  electronics: 'Electronics',
  appliances: 'Appliances',
  furniture: 'Furniture',
  jewelry: 'Jewelry, watches and furs',
  firearms: 'Firearms',
  silver: 'Silverware and fine china',
  collectibles: 'Collectibles',
  business: 'Business equipment',
  rugs: 'Rugs and textiles',
  clothing: 'Clothing',
  tools: 'Tools',
  kitchenware: 'Kitchenware',
  art: 'Art and decor',
  sports: 'Sports and outdoors',
  music: 'Instruments',
  books: 'Books and media',
  other: 'Other',
};

/** Things that usually carry a serial number worth writing down. Police need a firearm's serial to report it stolen. */
export const SERIAL_CATEGORIES: readonly Category[] = ['electronics', 'appliances', 'firearms', 'tools', 'music', 'sports'];

export interface Photo {
  id: Id;
  width: number;
  height: number;
  /** When the photo was taken, from the camera's own record (ms, local clock). Null when the picture didn't say. */
  takenAt: number | null;
  /** When it was added to Plainproof (ms). Null for photos saved before this was recorded. */
  addedAt: number | null;
}

export const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export interface Item {
  id: Id;
  roomId: Id;
  name: string;
  category: Category | null;
  /** How worn it is: insurers use it to work out what an older thing is worth. */
  condition: Condition | null;
  quantity: number;
  /** What one of these would cost to replace, in the smallest currency unit. */
  valueCents: number | null;
  /** What was paid for one, in the smallest currency unit. */
  pricePaidCents: number | null;
  /** YYYY-MM-DD */
  purchaseDate: string | null;
  purchasedFrom: string;
  brand: string;
  model: string;
  serial: string;
  notes: string;
  photos: Photo[];
  receipts: Photo[];
  createdAt: number;
  updatedAt: number;
  /** YYYY-MM-DD the warranty runs to. */
  warrantyUntil: string | null;
}

export interface Profile {
  homeName: string;
  ownerName: string;
  address: string;
  insurer: string;
  policyNumber: string;
}

export interface Settings {
  /** ISO 4217 code. */
  currency: string;
  /** Local reminders: a yearly look over the inventory, a nudge when the backup falls behind, warranties about to end. All off until the person turns them on. */
  reminders: { yearly: boolean; backup: boolean; warranty: boolean };
  /** Save a backup to the app's iCloud Drive folder by itself. Off by default. */
  icloudBackup: boolean;
}

export interface Meta {
  createdAt: number;
  onboarded: boolean;
  lastBackupAt: number | null;
  lastReportAt: number | null;
  /** The last change to anything in this place (items, rooms, the report heading, settings). */
  modifiedAt: number | null;
}

export interface Doc {
  version: typeof DOC_VERSION;
  rooms: Room[];
  items: Item[];
  profile: Profile;
  settings: Settings;
  meta: Meta;
  claims: Claim[];
  policy: Policy;
}

export const LIMITS = {
  name: 120,
  short: 120,
  notes: 2000,
  address: 300,
  quantity: 9999,
  /** 999,999,999.99 in cents. */
  cents: 99_999_999_999,
  photosPerItem: 12,
  receiptsPerItem: 6,
  rooms: 60,
  videosPerRoom: 6,
  policyDocuments: 20,
  /** Open claims in one place. More than a handful at once would be unusual; ending one makes room. */
  claims: 12,
  /** 500 MB: a backup has to fit on a phone and in a mail attachment service. */
  videoBytes: 500_000_000,
  /** A saved file may hold more rooms than the app lets one add; they are all kept when it is opened. */
  roomsOnLoad: 1000,
} as const;
