import { fromYmd } from './dates';
import { placeName, type Library } from './library';
import { backupState } from './selectors';

// What the phone should have waiting, worked out from the inventory and the
// person's reminder settings. Recomputed after every change; the platform
// layer makes the phone's scheduled notifications match it exactly.

export interface Planned {
  kind: 'yearly' | 'backup' | 'warranty';
  /** Stable for the same reminder, so the same plan always schedules the same things. */
  key: string;
  fireAt: number;
  title: string;
  body: string;
  /** What to open when it is tapped. */
  placeId: string | null;
  itemId: string | null;
}

const DAY = 86_400_000;
/** iOS keeps 64 waiting notifications per app; leave room. */
const MAX_WARRANTIES = 40;

function atHour(ms: number, hour: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0).getTime();
}

export function planReminders(lib: Library, now: number): Planned[] {
  const settings = lib.places[0]?.doc.settings;
  if (!settings) return [];
  const out: Planned[] = [];

  if (settings.reminders.yearly) {
    // A year after the inventory was last touched: a nudge to walk round and add what's new.
    let last = 0;
    for (const p of lib.places) {
      last = Math.max(last, p.doc.meta.modifiedAt ?? 0, p.doc.meta.createdAt, ...p.doc.items.map((i) => i.updatedAt));
    }
    let fireAt = atHour(last + 365 * DAY, 10);
    if (fireAt <= now) fireAt = atHour(now + DAY, 10);
    out.push({
      kind: 'yearly',
      key: 'yearly',
      fireAt,
      title: 'A year since you updated your inventory',
      body: 'Add what you’ve bought this year and check the values, so a claim isn’t short.',
      placeId: null,
      itemId: null,
    });
  }

  if (settings.reminders.backup) {
    // Three days after the first change the backup doesn't have, in the evening.
    let since: number | null = null;
    let where: string | null = null;
    for (const p of lib.places) {
      const state = backupState(p.doc);
      if (state !== 'never' && state !== 'behind') continue;
      const at = p.doc.meta.lastBackupAt ?? 0;
      const changes = [p.doc.meta.modifiedAt ?? 0, ...p.doc.items.map((i) => i.updatedAt)].filter((t) => t > at);
      const first = changes.length ? Math.min(...changes) : now;
      if (since === null || first < since) {
        since = first;
        where = p.id;
      }
    }
    if (since !== null) {
      let fireAt = atHour(since + 3 * DAY, 18);
      if (fireAt <= now) fireAt = atHour(now + DAY, 18);
      out.push({
        kind: 'backup',
        key: 'backup',
        fireAt,
        title: 'Your inventory isn’t backed up',
        body: 'You’ve made changes since the last backup. Keep a copy somewhere the phone isn’t.',
        placeId: where,
        itemId: null,
      });
    }
  }

  if (settings.reminders.warranty) {
    const ending: Planned[] = [];
    for (const p of lib.places) {
      for (const item of p.doc.items) {
        if (!item.warrantyUntil) continue;
        const ends = fromYmd(item.warrantyUntil).getTime();
        const fireAt = atHour(ends - 30 * DAY, 10);
        if (fireAt <= now) continue;
        ending.push({
          kind: 'warranty',
          key: `warranty-${item.id}`,
          fireAt,
          title: `Warranty ending: ${item.name}`,
          body: `The warranty runs out in 30 days${lib.places.length > 1 ? ` (${placeName(p)})` : ''}. Check it works before then.`,
          placeId: p.id,
          itemId: item.id,
        });
      }
    }
    ending.sort((a, b) => a.fireAt - b.fireAt);
    out.push(...ending.slice(0, MAX_WARRANTIES));
  }
  return out;
}
