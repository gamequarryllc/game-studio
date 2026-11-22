// The Second thought list against a fake of the Screen Time library, to check
// exactly what the phone is asked to do after a sum: which timers, what each
// one does when it fires, and that the list is only uncovered once the phone
// holds what covers it again. (Whether the phone then keeps its word can only
// be seen on a phone.)

import { ASK_ID, ASK_IDLE, ASK_OPEN, ASK_USE, ASK_WATCH, IDLE_MINUTES, IDLE_SPAN_MINUTES, USE_CAP_MINUTES, type AskFirst } from '@/domain/askFirst';

interface Registration {
  schedule: { intervalStart: { hour: number; minute: number }; intervalEnd: { hour: number; minute: number }; repeats: boolean };
  events: { eventName: string; familyActivitySelection: string; threshold: { hour: number; minute: number; second: number }; includesPastActivity: boolean }[];
}

interface FakePhone {
  held: Map<string, Registration>;
  actions: Map<string, unknown[]>;
  defaults: Map<string, unknown>;
  /** Every change to the list's cover and timers, in order. */
  log: string[];
  /** Timers the phone refuses to take. */
  refuses: Set<string>;
  picked: number;
}

function load(build = '', defaults = new Map<string, unknown>()) {
  const phone: FakePhone = { held: new Map(), actions: new Map(), defaults, log: [], refuses: new Set(), picked: 2 };
  let mod: typeof import('../askFirst') | undefined;
  jest.isolateModules(() => {
    // The app's own module, which says which build is installed.
    jest.doMock('expo', () => ({ __esModule: true, requireOptionalNativeModule: () => (build === '' ? null : { build: () => build }) }));
    jest.doMock('react-native-device-activity', () => ({
      __esModule: true,
      isAvailable: () => true,
      UIBlurEffectStyle: { systemMaterialDark: 1 },
      activitySelectionMetadata: () => (phone.picked > 0 ? { applicationCount: phone.picked, categoryCount: 0, webDomainCount: 0 } : null),
      getFamilyActivitySelectionId: (id: string) => (phone.picked > 0 ? `token-of-${id}` : undefined),
      getActivities: () => [...phone.held.keys()],
      stopMonitoring: (names: string[]) => {
        phone.log.push(`stop ${names.join(',')}`);
        for (const name of names) phone.held.delete(name);
      },
      startMonitoring: async (name: string, schedule: Registration['schedule'], events: Registration['events']) => {
        if (phone.refuses.has(name)) throw new Error('refused');
        phone.log.push(`start ${name}`);
        phone.held.set(name, { schedule, events });
      },
      configureActions: ({ activityName, callbackName, eventName, actions }: { activityName: string; callbackName: string; eventName?: string; actions: unknown[] }) => {
        phone.actions.set(eventName ? `${activityName}_${callbackName}_${eventName}` : `${activityName}_${callbackName}`, actions);
      },
      blockSelection: () => phone.log.push('cover'),
      unblockSelection: () => phone.log.push('uncover'),
      userDefaultsSet: (key: string, value: unknown) => phone.defaults.set(key, value),
      userDefaultsGet: (key: string) => phone.defaults.get(key),
      userDefaultsRemove: (key: string) => phone.defaults.delete(key),
      userDefaultsClearWithPrefix: (prefix: string) => {
        for (const key of [...phone.defaults.keys()]) if (key.startsWith(prefix)) phone.defaults.delete(key);
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../askFirst');
  });
  return { phone, ask: mod as typeof import('../askFirst') };
}

const minute = 60_000;
const minuteOfDay = (clock: { hour: number; minute: number }) => clock.hour * 60 + clock.minute;
const COVER_AGAIN = [
  { type: 'blockSelection', familyActivitySelectionId: ASK_ID },
  { type: 'stopMonitoring', activityNames: [ASK_OPEN, ASK_IDLE, ASK_USE] },
];
const now = new Date(2026, 10, 22, 14, 3, 20);
const recharge = new Date(2026, 10, 23, 6, 0).getTime();
const minutes: AskFirst = { on: true, openMinutes: 10 };
const inUse: AskFirst = { on: true, openMinutes: 10, whileInUse: true };

describe('after a sum, with minutes chosen', () => {
  it('opens for those minutes on one timer, as before', async () => {
    const { phone, ask } = load();
    const open = await ask.openAsk(minutes, recharge, now);
    expect(open).toEqual({ until: new Date(2026, 10, 22, 14, 14), inUse: false });
    expect([...phone.held.keys()]).toEqual([ASK_OPEN]);
    const timer = phone.held.get(ASK_OPEN) as Registration;
    expect(timer.schedule).toEqual({ intervalStart: { hour: 13, minute: 58 }, intervalEnd: { hour: 14, minute: 14 }, repeats: true });
    expect(timer.events).toEqual([]);
    expect(phone.actions.get(`${ASK_OPEN}_intervalDidEnd`)).toEqual(COVER_AGAIN);
    // Uncovered last, once the phone holds the timer.
    expect(phone.log[phone.log.length - 1]).toBe('uncover');
    expect(phone.log.indexOf(`start ${ASK_OPEN}`)).toBeLessThan(phone.log.indexOf('uncover'));
    expect(ask.askOpenUntil(now.getTime() + minute)).toBe(new Date(2026, 10, 22, 14, 14).getTime());
    expect(ask.askOpenUntil(new Date(2026, 10, 22, 14, 15).getTime())).toBe(0);
  });

  it('stays covered if the phone does not take the timer', async () => {
    for (const choice of [minutes, inUse]) {
      const { phone, ask } = load();
      phone.refuses.add(ASK_OPEN);
      expect(await ask.openAsk(choice, recharge, now)).toBeNull();
      expect(phone.log).not.toContain('uncover');
      // ...and nothing is left running.
      expect([...phone.held.keys()]).toEqual([]);
    }
  });
});

describe('after a sum, with "Until I leave it"', () => {
  it('opens for an hour at most, on a timer that has already begun', async () => {
    const { phone, ask } = load();
    const open = await ask.openAsk(inUse, recharge, now);
    expect(open).toEqual({ until: new Date(2026, 10, 22, 15, 4), inUse: true });
    const cap = phone.held.get(ASK_OPEN) as Registration;
    expect(cap.schedule).toEqual({ intervalStart: { hour: 14, minute: 2 }, intervalEnd: { hour: 15, minute: 4 }, repeats: true });
    expect(phone.actions.get(`${ASK_OPEN}_intervalDidEnd`)).toEqual(COVER_AGAIN);
  });

  it('covers it again when a timer STARTS two to three minutes on, and nothing is done when one ends', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    const idle = phone.held.get(ASK_IDLE) as Registration;
    expect(idle.schedule.intervalStart).toEqual({ hour: 14, minute: 6 });
    expect((minuteOfDay(idle.schedule.intervalEnd) - minuteOfDay(idle.schedule.intervalStart) + 1440) % 1440).toBe(IDLE_SPAN_MINUTES);
    expect(idle.schedule.repeats).toBe(false);
    expect(idle.events).toEqual([]);
    expect(phone.actions.get(`${ASK_IDLE}_intervalDidStart`)).toEqual(COVER_AGAIN);
    // Stopping a running timer is reported as its end: an end must cover nothing, or putting the timer off would.
    expect(phone.actions.has(`${ASK_IDLE}_intervalDidEnd`)).toBe(false);
    expect(phone.actions.has(`${ASK_USE}_intervalDidEnd`)).toBe(false);
  });

  it('puts that timer off at every minute of use, from the sum on, for an hour of use', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    const used = phone.held.get(ASK_USE) as Registration;
    expect(used.schedule).toEqual({ intervalStart: { hour: 14, minute: 2 }, intervalEnd: { hour: 15, minute: 4 }, repeats: true });
    expect(used.events).toHaveLength(USE_CAP_MINUTES);
    expect(used.events[0]).toEqual({ eventName: 'use01', familyActivitySelection: `token-of-${ASK_ID}`, threshold: { hour: 0, minute: 1, second: 0 }, includesPastActivity: false });
    expect(used.events[USE_CAP_MINUTES - 1]).toMatchObject({ eventName: 'use60', threshold: { hour: 1, minute: 0, second: 0 }, includesPastActivity: false });
    for (const event of used.events) {
      expect(phone.actions.get(`${ASK_USE}_eventDidReachThreshold_${event.eventName}`)).toEqual([
        { type: 'stopMonitoring', activityNames: [ASK_IDLE] },
        { type: 'startMonitoring', activityName: ASK_IDLE, deviceActivityEvents: [], intervalStartDelayMs: IDLE_MINUTES * minute, intervalEndDelayMs: (IDLE_MINUTES + IDLE_SPAN_MINUTES) * minute },
      ]);
    }
  });

  it('only uncovers once the phone holds all three timers', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    expect([...phone.held.keys()].sort()).toEqual([ASK_IDLE, ASK_OPEN, ASK_USE].sort());
    expect(phone.log.filter((line) => line === 'uncover')).toHaveLength(1);
    expect(phone.log[phone.log.length - 1]).toBe('uncover');
  });

  it('knows the list is covered again once the phone has stopped the timers, though the hour is not up', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    const soon = now.getTime() + 5 * minute;
    expect(ask.askOpenUntil(soon)).toBe(new Date(2026, 10, 22, 15, 4).getTime());
    // What the phone's extension does when the unused timer starts.
    for (const name of [ASK_OPEN, ASK_IDLE, ASK_USE]) phone.held.delete(name);
    expect(ask.askOpenUntil(soon)).toBe(0);
    // So the cover goes back on if the app took every cover off meanwhile.
    phone.log.length = 0;
    ask.coverAskAgain(inUse);
    expect(phone.log).toEqual(['cover']);
  });

  it('opens for the chosen minutes instead if the phone refuses the timers that put it off', async () => {
    for (const refused of [ASK_IDLE, ASK_USE]) {
      const { phone, ask } = load();
      phone.refuses.add(refused);
      const open = await ask.openAsk(inUse, recharge, now);
      expect(open).toEqual({ until: new Date(2026, 10, 22, 14, 14), inUse: false });
      expect([...phone.held.keys()]).toEqual([ASK_OPEN]);
      expect((phone.held.get(ASK_OPEN) as Registration).schedule.intervalStart).toEqual({ hour: 13, minute: 58 });
    }
  });

  it('a new sum starts every timer afresh', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    phone.log.length = 0;
    await ask.openAsk(minutes, recharge, new Date(now.getTime() + 5 * minute));
    expect(phone.log[0]).toBe(`stop ${[ASK_OPEN, ASK_IDLE, ASK_USE].join(',')}`);
    expect([...phone.held.keys()]).toEqual([ASK_OPEN]);
  });
});

describe('turning the list off', () => {
  it('stops every timer and takes the cover away', async () => {
    const { phone, ask } = load();
    await ask.openAsk(inUse, recharge, now);
    phone.held.set(ASK_WATCH, { schedule: { intervalStart: { hour: 0, minute: 0 }, intervalEnd: { hour: 23, minute: 59 }, repeats: true }, events: [] });
    await ask.applyAskFirst({ ...inUse, on: false }, { empty: false, recharge: '6:00 AM' });
    expect([...phone.held.keys()]).toEqual([]);
    expect(phone.log[phone.log.length - 1]).toBe('uncover');
    expect(ask.askOpenUntil(now.getTime() + minute)).toBe(0);
  });

  it('writes the covering screen for the choice made', async () => {
    const { phone, ask } = load();
    await ask.applyAskFirst(inUse, { empty: false, recharge: '6:00 AM' });
    const look = phone.defaults.get(`shieldConfigurationForSelection_${ASK_ID}`) as { subtitle: string };
    expect(look.subtitle).toContain('stays open until you leave it');
    await ask.applyAskFirst(minutes, { empty: false, recharge: '6:00 AM' });
    expect((phone.defaults.get(`shieldConfigurationForSelection_${ASK_ID}`) as { subtitle: string }).subtitle).toContain('opens for 10 minutes');
  });
});

describe('the first time a new build puts the cover in place', () => {
  const battery = { empty: false, recharge: '6:00 AM' };
  const covers = (log: string[]) => log.filter((line) => line === 'cover' || line === 'uncover');

  it('takes the cover off for a moment first, so the phone has this build draw the screens again', async () => {
    const { phone, ask } = load('1.1.0 (140)');
    const began = Date.now();
    await ask.applyAskFirst(minutes, battery);
    expect(covers(phone.log)).toEqual(['uncover', 'cover']);
    expect(Date.now() - began).toBeGreaterThanOrEqual(ask.AFRESH_GAP_MS - 20);
    expect(phone.defaults.get('plainlimit_ask_drawn_by')).toBe('1.1.0 (140)');
    // Once: coming back to the app only covers.
    await ask.applyAskFirst(minutes, battery);
    expect(covers(phone.log)).toEqual(['uncover', 'cover', 'cover']);
  });

  it('does nothing of the kind for a build that has already done it, or where the build is not known', async () => {
    const done = load('1.1.0 (140)', new Map<string, unknown>([['plainlimit_ask_drawn_by', '1.1.0 (140)']]));
    await done.ask.applyAskFirst(minutes, battery);
    expect(covers(done.phone.log)).toEqual(['cover']);
    const unknown = load();
    await unknown.ask.applyAskFirst(minutes, battery);
    expect(covers(unknown.phone.log)).toEqual(['cover']);
    expect(unknown.phone.defaults.has('plainlimit_ask_drawn_by')).toBe(false);
  });

  it('leaves a list that is open after a sum alone', async () => {
    const { phone, ask } = load('1.1.0 (140)');
    const opened = new Date();
    await ask.openAsk(minutes, opened.getTime() + 20 * 3_600_000, opened);
    phone.log.length = 0;
    await ask.applyAskFirst(minutes, battery);
    expect(covers(phone.log)).toEqual([]);
  });
});
