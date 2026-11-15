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
}

export const CATEGORIES = [
  'electronics',
  'appliances',
  'furniture',
  'jewelry',
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
  jewelry: 'Jewelry and watches',
  clothing: 'Clothing',
  tools: 'Tools',
  kitchenware: 'Kitchenware',
  art: 'Art and decor',
  sports: 'Sports and outdoors',
  music: 'Instruments',
  books: 'Books and media',
  other: 'Other',
};

/** Things that usually carry a serial number worth writing down. */
export const SERIAL_CATEGORIES: readonly Category[] = ['electronics', 'appliances', 'tools', 'music', 'sports'];

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
  /** A saved file may hold more rooms than the app lets one add; they are all kept when it is opened. */
  roomsOnLoad: 1000,
} as const;
