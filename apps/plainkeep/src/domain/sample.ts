import { addJob, addReading, addThing, logEntry, markDone, setSettings } from './actions';
import { addDays, addMonths, todayYmd } from './dates';
import { emptyDoc } from './doc';
import type { Doc, Settings } from './types';

// A household to look at: used by the Developer section, the browser tests and
// the store pictures. Everything is dated from today, so it never goes stale.

export const SAMPLE_IDS = { home: 'samplehome000001', car: 'samplecar0000001', truck: 'sampletruck00001', mower: 'samplemower00001' } as const;

let serial = 0;
const sid = (prefix: string) => `${prefix}${String((serial += 1)).padStart(16 - prefix.length, '0')}`;

/** `size` 'starter' fits the free version (a home and a car); 'full' has four things. */
export function sampleDoc(now: number, size: 'starter' | 'full' = 'full', settings: Partial<Settings> = {}): Doc {
  serial = 0;
  const today = todayYmd(now);
  const ago = (days: number) => addDays(today, -days);
  const monthsAgo = (n: number) => addMonths(today, -n);
  let doc = emptyDoc(now, { ...settings, onboarded: true });

  doc = addThing(doc, { kind: 'home', icon: 'house', name: 'Home', detail: '3 bed, built 1998' }, now, SAMPLE_IDS.home);
  doc = addThing(doc, { kind: 'vehicle', icon: 'car', name: 'Outback', detail: '2019 Subaru Outback 2.5i' }, now, SAMPLE_IDS.car);

  // Home
  const filter = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Furnace filter', note: '20 x 25 x 1, MERV 11', every: { n: 3, unit: 'month' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(98), leadDays: null }, now, filter, sid('ent'));
  doc = logEntry(doc, { thingId: SAMPLE_IDS.home, jobId: filter, title: 'Furnace filter', ymd: ago(190), distance: null, cost: 1899, note: 'Two-pack, one left in the basement', skipped: false }, now, sid('ent'));
  const alarms = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Test smoke and CO alarms', note: '', every: { n: 1, unit: 'month' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(26), leadDays: 0 }, now, alarms, sid('ent'));
  const hvac = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Heating and cooling service', note: 'Ask for the same technician', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(340), leadDays: 14 }, now, hvac, sid('ent'));
  doc = { ...doc, entries: doc.entries.map((e) => (e.jobId === hvac ? { ...e, cost: 18900, note: 'Cleaned the burners, replaced the igniter' } : e)) };
  const gutters = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Clean gutters', note: '', every: { n: 6, unit: 'month' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(75), leadDays: null }, now, gutters, sid('ent'));
  const dryer = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Clean dryer vent', note: '', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(150), leadDays: null }, now, dryer, sid('ent'));
  const heater = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.home, name: 'Flush water heater', note: '', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', firstDueYmd: addDays(today, 21), leadDays: null }, now, heater, sid('ent'));
  doc = logEntry(doc, { thingId: SAMPLE_IDS.home, jobId: null, title: 'Replaced kitchen faucet cartridge', ymd: ago(44), distance: null, cost: 3250, note: '', skipped: false }, now, sid('ent'));

  // Car: a year of readings, about 31 a day.
  doc = addReading(doc, SAMPLE_IDS.car, { ymd: ago(365), value: 51020 }, now);
  doc = addReading(doc, SAMPLE_IDS.car, { ymd: ago(170), value: 57110 }, now);
  doc = addReading(doc, SAMPLE_IDS.car, { ymd: ago(6), value: 62418 }, now);
  const oil = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.car, name: 'Oil and filter change', note: '0W-20 full synthetic, 4.4 qt', every: { n: 6, unit: 'month' }, everyDistance: 5000, anchor: 'done', lastDoneYmd: ago(170), lastDoneDistance: 57110, leadDays: null }, now, oil, sid('ent'));
  doc = { ...doc, entries: doc.entries.map((e) => (e.jobId === oil ? { ...e, cost: 7495, note: 'Done at the dealer' } : e)) };
  doc = logEntry(doc, { thingId: SAMPLE_IDS.car, jobId: oil, title: 'Oil and filter change', ymd: ago(352), distance: 51400, cost: 6850, note: '', skipped: false }, now, sid('ent'));
  const rotate = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.car, name: 'Tire rotation', note: '', every: null, everyDistance: 6000, anchor: 'done', lastDoneYmd: ago(170), lastDoneDistance: 57110, leadDays: null }, now, rotate, sid('ent'));
  const reg = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.car, name: 'Registration renewal', note: '', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'fixed', firstDueYmd: addDays(monthsAgo(12), 58), lastDoneYmd: addDays(monthsAgo(12), 50), leadDays: 30 }, now, reg, sid('ent'));
  doc = { ...doc, entries: doc.entries.map((e) => (e.jobId === reg ? { ...e, cost: 12400 } : e)) };
  const cabin = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.car, name: 'Cabin air filter', note: '', every: { n: 1, unit: 'year' }, everyDistance: 15000, anchor: 'done', lastDoneYmd: ago(290), lastDoneDistance: 53200, leadDays: null }, now, cabin, sid('ent'));
  const wipers = sid('job');
  doc = addJob(doc, { thingId: SAMPLE_IDS.car, name: 'Wiper blades', note: '26 in driver, 17 in passenger', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(200), leadDays: null }, now, wipers, sid('ent'));
  doc = logEntry(doc, { thingId: SAMPLE_IDS.car, jobId: null, title: 'New front brake pads and rotors', ymd: ago(120), distance: 58640, cost: 41200, note: 'Independent shop, 12-month warranty', skipped: false }, now, sid('ent'));

  if (size === 'full') {
    doc = addThing(doc, { kind: 'vehicle', icon: 'truck', name: 'Old truck', detail: '2008 Tacoma' }, now, SAMPLE_IDS.truck);
    doc = addReading(doc, SAMPLE_IDS.truck, { ymd: ago(200), value: 148200 }, now);
    doc = addReading(doc, SAMPLE_IDS.truck, { ymd: ago(40), value: 149950 }, now);
    const truckOil = sid('job');
    doc = addJob(doc, { thingId: SAMPLE_IDS.truck, name: 'Oil and filter change', note: '5W-30', every: { n: 6, unit: 'month' }, everyDistance: 5000, anchor: 'done', lastDoneYmd: ago(200), lastDoneDistance: 148200, leadDays: null }, now, truckOil, sid('ent'));
    doc = addThing(doc, { kind: 'other', icon: 'mower', name: 'Mower', detail: '' }, now, SAMPLE_IDS.mower);
    const blade = sid('job');
    doc = addJob(doc, { thingId: SAMPLE_IDS.mower, name: 'Sharpen blade', note: '', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(210), leadDays: null }, now, blade, sid('ent'));
    const mowerOil = sid('job');
    doc = addJob(doc, { thingId: SAMPLE_IDS.mower, name: 'Change oil', note: 'SAE 30, 18 oz', every: { n: 1, unit: 'year' }, everyDistance: null, anchor: 'done', lastDoneYmd: ago(210), leadDays: null }, now, mowerOil, sid('ent'));
    doc = markDone(doc, blade, { ymd: ago(580), cost: 1200 }, now, sid('ent'));
  }
  return setSettings(doc, {}, now);
}
