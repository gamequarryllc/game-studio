import { addJob, addThing, type JobInput } from '../actions';
import { atTime } from '../dates';
import { emptyDoc } from '../doc';
import type { Doc } from '../types';

export const TODAY = '2026-11-12';
/** Noon on the test day. */
export const NOW = atTime(TODAY, 12, 0);

export const HOME = 'home000000000001';
export const CAR = 'car0000000000001';

export function base(): Doc {
  let doc = emptyDoc(NOW, { onboarded: true, reminders: true });
  doc = addThing(doc, { kind: 'home', icon: 'house', name: 'Home', detail: '' }, NOW, HOME);
  doc = addThing(doc, { kind: 'vehicle', icon: 'car', name: 'Wagon', detail: '', odometer: 60000 }, NOW, CAR);
  return doc;
}

let n = 0;
export function nextId(prefix = 'id'): string {
  n += 1;
  return `${prefix}${String(n).padStart(12, '0')}`;
}

export function withJob(doc: Doc, input: Partial<JobInput> & { thingId: string }, id: string): Doc {
  return addJob(
    doc,
    { name: 'Job', note: '', every: { n: 3, unit: 'month' }, everyDistance: null, anchor: 'done', leadDays: null, ...input },
    NOW,
    id,
    nextId('ent'),
  );
}
