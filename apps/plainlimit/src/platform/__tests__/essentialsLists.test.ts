// The waiting rule for the essentials (domain/essentials.ts) against a fake of
// the Screen Time library: which of the phone's lists is written when Apple's
// picker closes, what counts and what stays open afterwards, and what the
// recharge starts. On the fake a list is its apps' names; on a phone it is
// Apple's sealed picks, which only the phone can compare. (Whether the phone
// then counts and locks by those lists can only be seen on a phone.)

import { COUNTED_ID } from '@/domain/monitorPlan';

interface Picks {
  applicationTokens: string[];
  categoryTokens: string[];
  webDomainTokens: string[];
  includeEntireCategory: boolean;
}

const LISTS = 'familyActivitySelectionIds';
const enc = (picks: Picks) => btoa(JSON.stringify(picks));
const dec = (token: string): Picks => JSON.parse(atob(token)) as Picks;
const NONE: Picks = { applicationTokens: [], categoryTokens: [], webDomainTokens: [], includeEntireCategory: true };

type Input = { activitySelectionId?: string; activitySelectionToken?: string };

function load() {
  const defaults = new Map<string, unknown>();
  /** Set on, the library gives no answer when asked to compare two lists handed to it. */
  const broken = { on: false };
  /** What the phone was last told to keep open whatever is covered. */
  const open: { apps: string[] | null } = { apps: null };
  const held = () => (defaults.get(LISTS) ?? {}) as Record<string, string>;
  const read = (input: Input): Picks => {
    if (input.activitySelectionId !== undefined) {
      const token = held()[input.activitySelectionId];
      return token ? dec(token) : NONE;
    }
    return input.activitySelectionToken ? dec(input.activitySelectionToken) : NONE;
  };
  // The native side sends "webdomainCount", not the "webDomainCount" its types promise.
  const meta = (picks: Picks) => ({ applicationCount: picks.applicationTokens.length, categoryCount: picks.categoryTokens.length, webdomainCount: picks.webDomainTokens.length, includeEntireCategory: picks.includeEntireCategory });
  const op = (each: (a: string[], b: string[]) => string[]) => (one: Input, two: Input) => {
    if (broken.on && one.activitySelectionToken !== undefined) return undefined;
    const a = read(one);
    const b = read(two);
    const out: Picks = { applicationTokens: each(a.applicationTokens, b.applicationTokens), categoryTokens: each(a.categoryTokens, b.categoryTokens), webDomainTokens: each(a.webDomainTokens, b.webDomainTokens), includeEntireCategory: true };
    return { familyActivitySelection: enc(out), ...meta(out) };
  };
  let mod: typeof import('../screenTime') | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-device-activity', () => ({
      __esModule: true,
      isAvailable: () => true,
      UIBlurEffectStyle: { systemMaterialDark: 1 },
      userDefaultsSet: (key: string, value: unknown) => defaults.set(key, value),
      userDefaultsGet: (key: string) => defaults.get(key),
      userDefaultsRemove: (key: string) => defaults.delete(key),
      activitySelectionMetadata: (input: Input) => meta(read(input)),
      getFamilyActivitySelectionId: (id: string) => held()[id],
      setFamilyActivitySelectionId: ({ id, familyActivitySelection }: { id: string; familyActivitySelection: string }) => defaults.set(LISTS, { ...held(), [id]: familyActivitySelection }),
      intersection: op((a, b) => a.filter((x) => b.includes(x))),
      union: op((a, b) => [...new Set([...a, ...b])]),
      difference: op((a, b) => a.filter((x) => !b.includes(x))),
      clearWhitelist: () => {
        open.apps = null;
      },
      clearWhitelistAndUpdateBlock: () => {
        open.apps = [];
      },
      addSelectionToWhitelistAndUpdateBlock: (input: Input) => {
        open.apps = [...read(input).applicationTokens].sort();
      },
    }));
    // A fresh copy per test needs require inside isolateModules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../screenTime');
  });
  const st = mod as typeof import('../screenTime');
  /** The apps in one of the phone's lists, in order; null when there is no such list. */
  const list = (id: string) => (held()[id] ? [...dec(held()[id]).applicationTokens].sort() : null);
  /** What Apple's picker does as ✓ is tapped: it keeps the ticks under the list it was opened on, and no list at all for none. */
  const tick = (id: string, apps: string[], more: Partial<Picks> = {}) => {
    const all = { ...held() };
    if (apps.length === 0) delete all[id];
    else all[id] = enc({ ...NONE, applicationTokens: apps, ...more });
    defaults.set(LISTS, all);
  };
  /** Apple's first list, opened and closed with these ticks. */
  const showApps = (apps: string[], free = false) => {
    st.appsBefore();
    tick(st.ALL_PICK_ID, apps);
    st.appsAfter(free);
  };
  /** Apple's second list, opened and closed with these ticks. Returns how many were refused. */
  const choose = (apps: string[], free = false) => {
    st.essentialsBefore();
    tick(st.ESSENTIALS_PICK_ID, apps);
    return st.essentialsAfter(free);
  };
  return { st, defaults, open, broken, list, tick, showApps, choose, problem: () => defaults.get('plainlimit_problem') };
}

const PHONE = ['Hinge', 'Maps', 'Messages', 'Phone', 'Reels', 'Spotify'];

/** Through setup with Maps, Messages and Phone as essentials, and a new battery looked at since. */
function settled() {
  const phone = load();
  phone.showApps(PHONE, true);
  expect(phone.choose(['Maps', 'Messages', 'Phone'], true)).toBe(0);
  phone.st.startWaitingPicks(true);
  return phone;
}

describe('choosing the essentials for the first time', () => {
  it('starts at once, whatever the day', () => {
    const { st, list, open, showApps, choose, problem } = load();
    showApps(PHONE);
    expect(choose(['Maps', 'Phone'])).toBe(0);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Messages', 'Reels', 'Spotify']);
    expect(open.apps).toEqual(['Maps', 'Phone']);
    expect(st.essentialsMode()).toBe(true);
    expect(problem()).toBeUndefined();
  });
});

describe('a new essential on an ordinary day', () => {
  it('waits: it still counts and still locks today, and the screen is told what waits', () => {
    const { st, list, open, choose, problem } = settled();
    expect(choose(['Hinge', 'Maps', 'Messages', 'Phone'])).toBe(0);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    // Hinge's minutes go on counting, and the phone is not told to keep it open.
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels', 'Spotify']);
    expect(open.apps).toEqual(['Maps', 'Messages', 'Phone']);
    expect(st.essentialsCount()).toBe(3);
    const joining = st.essentialsJoining();
    expect(joining?.count).toBe(1);
    expect(dec(joining?.picks as string).applicationTokens).toEqual(['Hinge']);
    expect(problem()).toBeUndefined();
  });

  it('Apple\'s list opens on the list as chosen, the waiting one ticked', () => {
    const { st, list, choose } = settled();
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    st.essentialsBefore();
    expect(list(st.ESSENTIALS_PICK_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    // Closed with nothing changed: as it was.
    expect(st.essentialsAfter(false)).toBe(0);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_PICK_ID)).toBeNull();
  });

  it('unticked again before the recharge, nothing waits', () => {
    const { st, list, choose } = settled();
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    choose(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(st.essentialsJoining()).toBeNull();
  });

  it('starts at the recharge, and is one of the day\'s own from then', () => {
    const { st, list, open, choose } = settled();
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(st.startWaitingPicks(true)).toBe(true);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Reels', 'Spotify']);
    expect(open.apps).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(st.essentialsJoining()).toBeNull();
    // Nothing waits any more: the next look changes nothing.
    expect(st.startWaitingPicks(true)).toBe(false);
    // Out and back in on the new day is at once.
    choose(['Maps', 'Messages', 'Phone']);
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
  });

  it('starts when an emergency pass is used, and a pass with nothing waiting changes nothing', () => {
    const { st, list, choose } = settled();
    choose(['Maps', 'Phone']);
    // Nothing waits: the day's own start stays, so Messages can still be put back at once.
    expect(st.startWaitingPicks(false)).toBe(false);
    choose(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    choose(['Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(COUNTED_ID)).toContain('Spotify');
    expect(st.startWaitingPicks(false)).toBe(true);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels']);
  });
});

describe('taking an essential out', () => {
  it('starts at once, and putting it back the same day does too', () => {
    const { st, list, open, choose } = settled();
    choose(['Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Messages', 'Phone']);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Maps', 'Reels', 'Spotify']);
    expect(open.apps).toEqual(['Messages', 'Phone']);
    choose(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels', 'Spotify']);
  });

  it('after the recharge it is a new essential like any other', () => {
    const { st, list, choose } = settled();
    choose(['Messages', 'Phone']);
    st.startWaitingPicks(true);
    choose(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toEqual(['Maps', 'Messages', 'Phone']);
  });

  it('one out and one in: the swap gains nothing today', () => {
    const { st, list, choose } = settled();
    choose(['Messages', 'Phone', 'Reels']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Messages', 'Phone']);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Maps', 'Reels', 'Spotify']);
    expect(st.essentialsJoining()?.count).toBe(1);
  });

  it('all of them: no essentials today, none waiting', () => {
    const { st, list, open, choose } = settled();
    choose([]);
    expect(list(st.ESSENTIALS_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(PHONE);
    expect(open.apps).toEqual([]);
    expect(st.essentialsCount()).toBe(0);
    // And back, the same day.
    choose(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
  });
});

describe('free days', () => {
  it('on setup\'s own day or under an emergency pass a new essential starts at once', () => {
    const { st, list, open, choose } = settled();
    choose(['Maps', 'Messages', 'Phone', 'Spotify'], true);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels']);
    expect(open.apps).toEqual(['Maps', 'Messages', 'Phone', 'Spotify']);
    // And stays today's after the pass: out and back in is at once.
    choose(['Maps', 'Messages', 'Phone']);
    choose(['Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone', 'Spotify']);
  });

  it('a list that was waiting starts with a choice made under a pass', () => {
    const { st, list, choose } = settled();
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    // Apple's list opens on the list as chosen; ✓ under a pass starts it.
    st.essentialsBefore();
    expect(st.essentialsAfter(true)).toBe(0);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
  });
});

describe('what is never kept', () => {
  it('more essentials than iOS can keep open change nothing', () => {
    const { st, list, choose } = settled();
    choose(['Hinge', 'Maps', 'Messages', 'Phone']);
    const many = Array.from({ length: 51 }, (_, i) => `App ${i}`);
    expect(choose(many)).toBe(51);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_PICK_ID)).toBeNull();
  });

  it('Apple\'s list left open when the app is shut changes nothing', () => {
    const { st, list, tick } = settled();
    st.essentialsBefore();
    tick(st.ESSENTIALS_PICK_ID, ['Maps', 'Messages', 'Phone', 'Reels']);
    // The app never hears the list close. The lists in force are untouched...
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels', 'Spotify']);
    // ...and the next recharge does not start it either.
    expect(st.startWaitingPicks(true)).toBe(false);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Messages', 'Phone']);
    // The next time Apple's list opens it starts from the list in force again.
    st.essentialsBefore();
    expect(list(st.ESSENTIALS_PICK_ID)).toEqual(['Maps', 'Messages', 'Phone']);
  });
});

describe('lists made by a build before the rule', () => {
  it('today\'s essentials are the battery\'s own until the first look notes them', () => {
    const { st, list, defaults, tick, choose } = load();
    // As build 157 left the phone: the lists, and when the essentials were chosen.
    tick(st.ALL_ID, PHONE);
    tick(st.ESSENTIALS_ID, ['Maps', 'Phone']);
    tick(COUNTED_ID, ['Hinge', 'Messages', 'Reels', 'Spotify']);
    defaults.set('plainlimit_essentials_set', 1);
    choose(['Maps', 'Phone', 'Reels']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toEqual(['Maps', 'Phone', 'Reels']);
    // Taking one out and putting it back is still at once.
    choose(['Phone']);
    choose(['Maps', 'Phone']);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Maps', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
  });
});

describe('the phone\'s whole list of apps', () => {
  it('an app left off it goes on counting until the recharge', () => {
    const { st, list, showApps, problem } = settled();
    showApps(PHONE.filter((a) => a !== 'Reels'));
    expect(list(st.ALL_ID)).toEqual(PHONE);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels', 'Spotify']);
    expect(list(st.ALL_NEXT_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone', 'Spotify']);
    expect(st.startWaitingPicks(true)).toBe(true);
    expect(list(st.ALL_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(st.ALL_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Spotify']);
    expect(problem()).toBeUndefined();
  });

  it('a newly installed app counts from now', () => {
    const { st, list, showApps } = settled();
    showApps([...PHONE, 'Threads']);
    expect(list(st.ALL_ID)).toEqual([...PHONE, 'Threads']);
    expect(list(st.ALL_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Reels', 'Spotify', 'Threads']);
  });

  it('ticked in full again, an app left off earlier that day stays', () => {
    const { st, list, showApps } = settled();
    showApps(PHONE.filter((a) => a !== 'Reels'));
    showApps(PHONE);
    expect(list(st.ALL_NEXT_ID)).toBeNull();
    expect(list(st.ALL_ID)).toEqual(PHONE);
  });

  it('on a free day it is as ticked', () => {
    const { st, list, showApps } = settled();
    showApps(PHONE.filter((a) => a !== 'Reels'), true);
    expect(list(st.ALL_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone', 'Spotify']);
    expect(list(COUNTED_ID)).toEqual(['Hinge', 'Spotify']);
  });

  it('emptied, it is not kept', () => {
    const { st, list, showApps } = settled();
    showApps([]);
    expect(list(st.ALL_ID)).toEqual(PHONE);
    expect(list(st.ALL_NEXT_ID)).toBeNull();
    expect(list(st.ALL_PICK_ID)).toBeNull();
    expect(st.appsShown()).toBe(PHONE.length);
  });
});

describe('a phone that cannot compare two lists', () => {
  it('starts the change at once, as before the rule, and says so in the readout', () => {
    const { st, list, broken, choose, problem } = settled();
    broken.on = true;
    expect(choose(['Hinge', 'Maps', 'Messages', 'Phone'])).toBe(0);
    expect(list(st.ESSENTIALS_ID)).toEqual(['Hinge', 'Maps', 'Messages', 'Phone']);
    expect(list(st.ESSENTIALS_NEXT_ID)).toBeNull();
    expect(list(COUNTED_ID)).toEqual(['Reels', 'Spotify']);
    expect(String(problem())).toContain('the waiting rule');
  });
});
