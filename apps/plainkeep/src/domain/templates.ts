import type { Interval, ThingKind } from './types';

// Jobs most homes and cars have, with the interval most manuals give. They are
// starting points: every one can be changed, and the app says so.

export interface Template {
  key: string;
  name: string;
  every: Interval | null;
  /** In miles; converted for kilometres when added. */
  everyMiles: number | null;
  /** Stays on its calendar date (a registration), rather than counting from when it was done. */
  fixed?: boolean;
  /** Ticked to begin with in the list of suggestions. */
  common?: boolean;
  /** A hint for the job's note. */
  hint?: string;
}

const m = (n: number): Interval => ({ n, unit: 'month' });
const y = (n: number): Interval => ({ n, unit: 'year' });

export const HOME_TEMPLATES: Template[] = [
  { key: 'furnace-filter', name: 'Furnace filter', every: m(3), everyMiles: null, common: true, hint: 'Filter size' },
  { key: 'smoke-test', name: 'Test smoke and CO alarms', every: m(1), everyMiles: null, common: true },
  { key: 'smoke-batteries', name: 'Smoke alarm batteries', every: y(1), everyMiles: null, common: true },
  { key: 'hvac-service', name: 'Heating and cooling service', every: y(1), everyMiles: null, common: true },
  { key: 'gutters', name: 'Clean gutters', every: m(6), everyMiles: null, common: true },
  { key: 'water-heater', name: 'Flush water heater', every: y(1), everyMiles: null },
  { key: 'dryer-vent', name: 'Clean dryer vent', every: y(1), everyMiles: null, common: true },
  { key: 'fridge-coils', name: 'Vacuum refrigerator coils', every: m(6), everyMiles: null },
  { key: 'fridge-water-filter', name: 'Refrigerator water filter', every: m(6), everyMiles: null },
  { key: 'range-hood', name: 'Range hood filter', every: m(3), everyMiles: null },
  { key: 'water-softener', name: 'Water softener salt', every: m(2), everyMiles: null },
  { key: 'sump-pump', name: 'Test sump pump', every: m(6), everyMiles: null },
  { key: 'chimney', name: 'Chimney sweep', every: y(1), everyMiles: null },
  { key: 'septic', name: 'Pump septic tank', every: y(3), everyMiles: null },
  { key: 'extinguisher', name: 'Check fire extinguisher', every: y(1), everyMiles: null },
  { key: 'caulk', name: 'Check caulk and weatherstripping', every: y(1), everyMiles: null },
  { key: 'pest', name: 'Pest control', every: m(3), everyMiles: null },
  { key: 'deck', name: 'Seal deck', every: y(2), everyMiles: null },
];

export const VEHICLE_TEMPLATES: Template[] = [
  { key: 'oil', name: 'Oil and filter change', every: m(6), everyMiles: 5000, common: true, hint: 'Oil weight and filter number' },
  { key: 'tire-rotation', name: 'Tire rotation', every: null, everyMiles: 6000, common: true },
  { key: 'registration', name: 'Registration renewal', every: y(1), everyMiles: null, fixed: true, common: true },
  { key: 'inspection', name: 'Inspection', every: y(1), everyMiles: null, fixed: true },
  { key: 'insurance', name: 'Insurance renewal', every: m(6), everyMiles: null, fixed: true },
  { key: 'engine-air', name: 'Engine air filter', every: null, everyMiles: 15000, common: true },
  { key: 'cabin-air', name: 'Cabin air filter', every: y(1), everyMiles: 15000, common: true },
  { key: 'wipers', name: 'Wiper blades', every: y(1), everyMiles: null, common: true },
  { key: 'brake-fluid', name: 'Brake fluid', every: y(2), everyMiles: null },
  { key: 'brakes', name: 'Check brake pads', every: y(1), everyMiles: 12000 },
  { key: 'coolant', name: 'Coolant', every: y(5), everyMiles: 60000 },
  { key: 'transmission', name: 'Transmission fluid', every: null, everyMiles: 60000 },
  { key: 'spark-plugs', name: 'Spark plugs', every: null, everyMiles: 60000 },
  { key: 'battery', name: 'Test battery', every: y(1), everyMiles: null },
  { key: 'tires', name: 'Check tire tread and pressure', every: m(1), everyMiles: null },
  { key: 'alignment', name: 'Wheel alignment', every: y(2), everyMiles: null },
];

export const OTHER_TEMPLATES: Template[] = [
  { key: 'service', name: 'Service', every: y(1), everyMiles: null, common: true },
  { key: 'mower-oil', name: 'Change oil', every: y(1), everyMiles: null },
  { key: 'mower-blade', name: 'Sharpen blade', every: y(1), everyMiles: null },
  { key: 'air-filter', name: 'Air filter', every: y(1), everyMiles: null },
  { key: 'spark-plug', name: 'Spark plug', every: y(2), everyMiles: null },
  { key: 'battery', name: 'Charge or replace battery', every: y(1), everyMiles: null },
  { key: 'clean', name: 'Clean and inspect', every: m(6), everyMiles: null },
  { key: 'winterize', name: 'Winterize', every: y(1), everyMiles: null, fixed: true },
];

export function templatesFor(kind: ThingKind): Template[] {
  return kind === 'home' ? HOME_TEMPLATES : kind === 'vehicle' ? VEHICLE_TEMPLATES : OTHER_TEMPLATES;
}

/** A template's distance in the person's unit, rounded to a figure a manual would print. */
export function templateDistance(t: Template, unit: 'mi' | 'km'): number | null {
  if (t.everyMiles === null) return null;
  if (unit === 'mi') return t.everyMiles;
  const km = t.everyMiles * 1.609344;
  const step = km >= 20000 ? 5000 : 1000;
  return Math.max(step, Math.round(km / step) * step);
}
