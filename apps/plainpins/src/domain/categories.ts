import type { Category } from './types';

// What kind of place a pin is. Each kind has its own ink on the map, the way a
// printed map's legend does; the colours are chosen to hold up on both the
// light map and the dark one.

export interface CategoryInfo {
  key: Category;
  label: string;
  color: string;
  /** SF Symbol on iPhone. */
  sf: string;
  /** Material symbol on the web preview. */
  web: string;
}

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  beach: { key: 'beach', label: 'Beach', color: '#D99A1F', sf: 'beach.umbrella.fill', web: 'beach_access' },
  park: { key: 'park', label: 'Park', color: '#2F8F5B', sf: 'tree.fill', web: 'park' },
  trail: { key: 'trail', label: 'Trail', color: '#7A7B2E', sf: 'figure.hiking', web: 'hiking' },
  water: { key: 'water', label: 'On the water', color: '#2478B5', sf: 'sailboat.fill', web: 'sailing' },
  city: { key: 'city', label: 'Town', color: '#56658C', sf: 'building.2.fill', web: 'location_city' },
  food: { key: 'food', label: 'Food and drink', color: '#DE6B35', sf: 'fork.knife', web: 'restaurant' },
  museum: { key: 'museum', label: 'Museum', color: '#8757A6', sf: 'building.columns.fill', web: 'museum' },
  stay: { key: 'stay', label: 'Stay', color: '#1F9488', sf: 'bed.double.fill', web: 'hotel' },
  event: { key: 'event', label: 'Event', color: '#C4447F', sf: 'ticket.fill', web: 'confirmation_number' },
  landmark: { key: 'landmark', label: 'Landmark', color: '#C4412B', sf: 'star.fill', web: 'star' },
  other: { key: 'other', label: 'Somewhere else', color: '#6A7280', sf: 'mappin', web: 'place' },
};
