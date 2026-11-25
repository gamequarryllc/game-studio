import { advance, freshDoc, repairDoc } from '../dayState';
import { essentialsAtRecharge, withApps, withEssentials, type Lists } from '../essentials';
import type { Doc } from '../types';

// Plain sets stand in for Apple's sealed picks; on a phone the same three
// questions are answered by the phone (screenTime.ts).
type Apps = ReadonlySet<string>;
const apps = (...names: string[]): Apps => new Set(names);
const sets: Lists<Apps> = {
  both: (a, b) => new Set([...a].filter((x) => b.has(x))),
  either: (a, b) => new Set([...a, ...b]),
  less: (a, b) => new Set([...a].filter((x) => !b.has(x))),
  size: (list) => list.size,
};
const names = (list: Apps | null) => (list === null ? null : [...list].sort());

describe('changing the essentials mid-day', () => {
  const start = apps('Maps', 'Messages', 'Phone');

  it('a new essential waits for the recharge: today keeps counting it', () => {
    const change = withEssentials(apps('Maps', 'Messages', 'Phone', 'Hinge'), start, false, sets);
    expect(names(change.today)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(names(change.next)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(names(change.start)).toEqual(['Maps', 'Messages', 'Phone']);
  });

  it('taking one out starts at once', () => {
    const change = withEssentials(apps('Messages', 'Phone'), start, false, sets);
    expect(names(change.today)).toEqual(['Messages', 'Phone']);
    expect(change.next).toBeNull();
    // The day's own start is kept, so it can be put back today.
    expect(names(change.start)).toEqual(['Maps', 'Messages', 'Phone']);
  });

  it('putting back one the battery started with starts at once', () => {
    const out = withEssentials(apps('Messages', 'Phone'), start, false, sets);
    const back = withEssentials(apps('Maps', 'Messages', 'Phone'), out.start, false, sets);
    expect(names(back.today)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(back.next).toBeNull();
  });

  it('one out and one in: the one out goes now, the one in waits', () => {
    const change = withEssentials(apps('Messages', 'Phone', 'Hinge'), start, false, sets);
    expect(names(change.today)).toEqual(['Messages', 'Phone']);
    expect(names(change.next)).toEqual(['Hinge', 'Messages', 'Phone']);
  });

  it('swapping an app that was used a lot for one that was not gains nothing today', () => {
    // The way round: take Maps out, tick the app that ate the battery.
    const change = withEssentials(apps('Messages', 'Phone', 'Reels'), start, false, sets);
    expect(change.today.has('Reels')).toBe(false);
  });

  it('choosing again while a list waits replaces the waiting one', () => {
    const first = withEssentials(apps('Maps', 'Messages', 'Phone', 'Hinge'), start, false, sets);
    // Apple's list opens on the chosen list; Hinge is unticked again.
    const second = withEssentials(apps('Maps', 'Messages', 'Phone'), first.start, false, sets);
    expect(second.next).toBeNull();
    expect(names(second.today)).toEqual(['Maps', 'Messages', 'Phone']);
    // And with another app instead: only that one waits.
    const third = withEssentials(apps('Maps', 'Messages', 'Phone', 'Spotify'), first.start, false, sets);
    expect(names(third.next)).toEqual(['Maps', 'Messages', 'Phone', 'Spotify']);
  });

  it('an empty choice empties today, and nothing waits', () => {
    const change = withEssentials(apps(), start, false, sets);
    expect(names(change.today)).toEqual([]);
    expect(change.next).toBeNull();
  });

  it('from no essentials at all, every one ticked waits', () => {
    const change = withEssentials(apps('Phone'), apps(), false, sets);
    expect(names(change.today)).toEqual([]);
    expect(names(change.next)).toEqual(['Phone']);
  });
});

describe('free days', () => {
  it('during setup, on its own day, or under an emergency pass, a new essential starts at once', () => {
    const change = withEssentials(apps('Phone', 'Spotify'), apps('Phone'), true, sets);
    expect(names(change.today)).toEqual(['Phone', 'Spotify']);
    expect(change.next).toBeNull();
  });

  it('the choice becomes the day\'s own start, so it stays today\'s after the pass', () => {
    const during = withEssentials(apps('Phone', 'Spotify'), apps('Phone'), true, sets);
    const out = withEssentials(apps('Phone'), during.start, false, sets);
    const back = withEssentials(apps('Phone', 'Spotify'), out.start, false, sets);
    expect(names(back.today)).toEqual(['Phone', 'Spotify']);
    expect(back.next).toBeNull();
  });

  it('an app taken out under a pass does not come back free afterwards', () => {
    const during = withEssentials(apps('Phone'), apps('Phone', 'Maps'), true, sets);
    const after = withEssentials(apps('Phone', 'Maps'), during.start, false, sets);
    expect(names(after.today)).toEqual(['Phone']);
    expect(names(after.next)).toEqual(['Maps', 'Phone']);
  });
});

describe('the recharge', () => {
  it('starts a waiting list, which the new battery starts with', () => {
    const change = withEssentials(apps('Phone', 'Hinge'), apps('Phone'), false, sets);
    const day = essentialsAtRecharge(change.today, change.next);
    expect(names(day.today)).toEqual(['Hinge', 'Phone']);
    expect(names(day.start)).toEqual(['Hinge', 'Phone']);
    // From then Hinge is one of the day's own: out and back in is at once.
    const out = withEssentials(apps('Phone'), day.start, false, sets);
    expect(withEssentials(apps('Phone', 'Hinge'), out.start, false, sets).next).toBeNull();
  });

  it('with nothing waiting, the day starts with the list in force', () => {
    const out = withEssentials(apps('Phone'), apps('Phone', 'Maps'), false, sets);
    const day = essentialsAtRecharge(out.today, out.next);
    expect(names(day.start)).toEqual(['Phone']);
    // Yesterday's essential is a new one today: it waits again.
    expect(names(withEssentials(apps('Phone', 'Maps'), day.start, false, sets).today)).toEqual(['Phone']);
  });
});

describe('the phone\'s whole list of apps', () => {
  const before = apps('Hinge', 'Maps', 'Phone', 'Reels');

  it('an app left off goes on counting until the recharge', () => {
    const change = withApps(apps('Hinge', 'Maps', 'Phone'), before, false, sets);
    expect(names(change.today)).toEqual(['Hinge', 'Maps', 'Phone', 'Reels']);
    expect(names(change.next)).toEqual(['Hinge', 'Maps', 'Phone']);
  });

  it('a newly installed app counts from now', () => {
    const change = withApps(apps('Hinge', 'Maps', 'Phone', 'Reels', 'Threads'), before, false, sets);
    expect(names(change.today)).toEqual(['Hinge', 'Maps', 'Phone', 'Reels', 'Threads']);
    expect(change.next).toBeNull();
  });

  it('one new and one left off: the new one counts now, the other until the recharge', () => {
    const change = withApps(apps('Hinge', 'Maps', 'Phone', 'Threads'), before, false, sets);
    expect(names(change.today)).toEqual(['Hinge', 'Maps', 'Phone', 'Reels', 'Threads']);
    expect(names(change.next)).toEqual(['Hinge', 'Maps', 'Phone', 'Threads']);
  });

  it('on a free day the list is as ticked', () => {
    const change = withApps(apps('Maps', 'Phone'), before, true, sets);
    expect(names(change.today)).toEqual(['Maps', 'Phone']);
    expect(change.next).toBeNull();
  });
});

describe('which battery has been looked at', () => {
  const start = new Date(2026, 10, 20, 6, 0);
  const noted = (): Doc => {
    const d = freshDoc(start);
    return { ...d, setupDone: true, watching: true, day: { ...d.day, periodStart: start.toISOString(), essentialsNoted: true } };
  };

  it('a battery after a recharge has not been: what waits for it is still to start', () => {
    const next = advance(noted(), new Date(2026, 10, 21, 6, 1));
    expect(next.day.periodStart).toBe(new Date(2026, 10, 21, 6, 0).toISOString());
    expect(next.day.essentialsNoted).toBeUndefined();
  });

  it('the same battery stays looked at', () => {
    expect(advance(noted(), new Date(2026, 10, 20, 23, 0)).day.essentialsNoted).toBe(true);
  });

  it('a battery begun by moving the recharge time is the same day to the essentials', () => {
    // Setup's own day lets the recharge time move at once, which begins a battery without a recharge.
    const d = noted();
    const moved = advance({ ...d, day: { ...d.day, firstDay: true }, settings: { ...d.settings, rechargeMinute: 6 * 60 + 30 } }, new Date(2026, 10, 20, 15, 0));
    expect(moved.day.periodStart).not.toBe(d.day.periodStart);
    expect(moved.day.essentialsNoted).toBe(true);
    // The recharge after it is a real one.
    expect(advance(moved, new Date(2026, 10, 21, 6, 31)).day.essentialsNoted).toBeUndefined();
  });

  it('a recharge time waiting for the battery to end keeps it the same battery while it runs on', () => {
    const d = noted();
    // 6:00 to 8:00 AM: the battery runs on to 8:00, and only then is there a recharge.
    const waiting = { ...d, settings: { ...d.settings, nextRechargeMinute: 8 * 60 } };
    const runsOn = advance(waiting, new Date(2026, 10, 21, 6, 30));
    expect(runsOn.day.essentialsNoted).toBe(true);
    expect(advance(runsOn, new Date(2026, 10, 21, 8, 1)).day.essentialsNoted).toBeUndefined();
  });

  it('is read back from a saved copy only when it is really there', () => {
    const now = new Date(2026, 10, 20, 12, 0);
    const day = { periodStart: start.toISOString(), usedMinutes: 10, topUps: 0, unlockedUntil: null, uncounted: false };
    expect(repairDoc({ settings: {}, setupDone: true, day: { ...day, essentialsNoted: true } }, now).day.essentialsNoted).toBe(true);
    expect(repairDoc({ settings: {}, setupDone: true, day: { ...day, essentialsNoted: 'yes' } }, now).day.essentialsNoted).toBeUndefined();
    // A copy saved before the rule: looked at on the next start.
    expect(repairDoc({ settings: {}, setupDone: true, day }, now).day.essentialsNoted).toBeUndefined();
  });
});
