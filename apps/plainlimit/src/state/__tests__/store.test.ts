// The store against a fake of the one file that talks to Apple's Screen Time,
// so the phone-only paths (counting problems, locked settings, held locks, a
// phone that throws) can be checked without a phone.

type Fake = Record<string, jest.Mock | boolean>;

/** A phone that is counting and fine, with every call recorded. Tests change what they need. */
function fakePhone(): Fake {
  return {
    // So the store's "import * as screenTime" uses this very object, and a test can swap a call out after loading.
    __esModule: true,
    SCREEN_TIME_AVAILABLE: true,
    isOn: jest.fn(() => true),
    usedSoFar: jest.fn(() => null),
    health: jest.fn(() => 'fine'),
    applyPlan: jest.fn(async () => true),
    registeredGoal: jest.fn(() => 180),
    registeredRecharge: jest.fn(() => 360),
    askPermission: jest.fn(async () => 'approved'),
    busyRegistering: jest.fn(() => false),
    clearPicks: jest.fn(),
    countAgain: jest.fn(async () => true),
    recountDue: jest.fn(() => true),
    markRecounted: jest.fn(),
    coverAgain: jest.fn(),
    fixOldPicks: jest.fn(() => 'fine'),
    coverEmptyNow: jest.fn(),
    grantExtraTime: jest.fn(async () => {}),
    endExtraTime: jest.fn(),
    holdLocks: jest.fn(),
    locksHeldUntil: jest.fn(() => 0),
    noteHistoryLoss: jest.fn(),
    noteKnown: jest.fn(),
    onCheckpoint: jest.fn(() => () => {}),
    picksAfter: jest.fn(() => false),
    appsAfter: jest.fn(),
    essentialsAfter: jest.fn(() => 0),
    startWaitingPicks: jest.fn(() => false),
    refreshScreens: jest.fn(),
    releaseLocks: jest.fn(),
    reloadWidget: jest.fn(),
    shareWithWidget: jest.fn(),
    rightAgain: jest.fn(),
    turnOff: jest.fn(),
    wrongSince: jest.fn((now: number) => now),
    permission: jest.fn(() => 'approved'),
  };
}

/** A fake of Ask first's phone side, with every call recorded. */
function fakeAsk(): Fake {
  return {
    __esModule: true,
    allowAskFirst: jest.fn(),
    applyAskFirst: jest.fn(async () => {}),
    openAsk: jest.fn(async () => ({ until: new Date(Date.now() + 10 * 60_000), inUse: false })),
  };
}

/** A saved copy that has been through setup, counting, `used` minutes into a 3-hour day. */
function saved(used: number, extra: Record<string, unknown> = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return {
    v: 1,
    settings: { goalMinutes: 180, rechargeMinute: 360, countMode: 'custom', emptyLevel: 'work', allowed: [] },
    day: { periodStart: start.toISOString(), usedMinutes: used, topUps: 0, unlockedUntil: null, uncounted: false },
    watching: true,
    setupDone: true,
    history: [],
    ...extra,
  };
}

/** A fresh store module over `phone`, with `raw` as the saved copy. */
function load(phone: Fake, raw: unknown, ask: Fake = fakeAsk()) {
  let mod: typeof import('../store') | undefined;
  let rn: typeof import('react-native') | undefined;
  jest.isolateModules(() => {
    jest.doMock('@/platform/screenTime', () => phone);
    jest.doMock('@/platform/askFirst', () => ask);
    jest.doMock('@/platform/storage', () => ({ readSaved: jest.fn(async () => raw), writeSaved: jest.fn(async () => {}) }));
    // A fresh copy per test needs require inside isolateModules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../store');
    // The copy of React Native the store sees, for a test to stand in for the phone's app state.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rn = require('react-native');
  });
  return { ...(mod as typeof import('../store')), rn: rn as typeof import('react-native') };
}

// The store looks again on timers after some changes; fake ones keep a test from leaving them running.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('starting up', () => {
  it('opens even when the phone throws while loading', async () => {
    const phone = fakePhone();
    let broken = true;
    const fails = (fine: unknown) =>
      jest.fn(() => {
        if (broken) throw new Error('native module gone');
        return fine;
      });
    phone.isOn = fails(true);
    phone.health = fails('fine');
    const { store } = load(phone, saved(40));
    await store.start();
    broken = false;
    expect(store.get().state).toBe('ready');
    expect(store.get().doc.day.usedMinutes).toBe(40);
    expect(phone.noteHistoryLoss).toHaveBeenCalledWith('started without the phone after an error while loading');
  });

  it('opens on a fresh copy when the saved one is junk', async () => {
    const { store } = load(fakePhone(), 'not a doc');
    await store.start();
    expect(store.get().state).toBe('ready');
    expect(store.get().doc.setupDone).toBe(false);
  });
});

describe('marking a day not fully counted', () => {
  it('ignores a single bad reading', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    phone.health = jest.fn(() => 'notRegistered');
    store.tick(new Date());
    expect(store.get().doc.day.uncounted).toBe(false);
  });

  it('marks it once counting has looked wrong for two minutes', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    phone.health = jest.fn(() => 'accessOff');
    phone.wrongSince = jest.fn((now: number) => now - 3 * 60 * 1000);
    store.tick(new Date());
    expect(store.get().doc.day.uncounted).toBe(true);
    expect(phone.noteHistoryLoss).toHaveBeenCalledWith(expect.stringContaining('today marked not fully counted (accessOff'));
  });

  it('never marks it during setup', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40, { setupDone: false }));
    await store.start();
    phone.health = jest.fn(() => 'notRegistered');
    phone.wrongSince = jest.fn((now: number) => now - 60 * 60 * 1000);
    store.tick(new Date());
    expect(store.get().doc.day.uncounted).toBe(false);
  });

  it('never marks it while Plainlimit itself is registering', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    phone.health = jest.fn(() => 'notRegistered');
    phone.busyRegistering = jest.fn(() => true);
    phone.wrongSince = jest.fn((now: number) => now - 60 * 60 * 1000);
    store.tick(new Date());
    expect(store.get().doc.day.uncounted).toBe(false);
  });

  it('counts again by itself, once a battery, after a report that cannot be true', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(80));
    await store.start();
    phone.health = jest.fn(() => 'miscounted');
    store.tick(new Date());
    // Lets the recount finish (and its redraw set its timers) while the timers are still fake.
    await Promise.resolve();
    await Promise.resolve();
    expect(phone.countAgain).toHaveBeenCalledTimes(1);
    expect(phone.markRecounted).toHaveBeenCalledTimes(1);
    // Noted first, so the registration that follows is guarded by what is known now.
    expect(phone.noteKnown).toHaveBeenCalledWith(expect.anything(), 80);
    expect(store.get().doc.day.uncounted).toBe(false);
    // Already done for this battery: Today offers Count again instead.
    phone.recountDue = jest.fn(() => false);
    store.tick(new Date());
    expect(phone.countAgain).toHaveBeenCalledTimes(1);
  });

  it('does not count again by itself while the battery is empty: that lock is real', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(180));
    await store.start();
    phone.health = jest.fn(() => 'miscounted');
    store.tick(new Date());
    expect(phone.countAgain).not.toHaveBeenCalled();
  });

  it('clears the run of bad readings when counting looks fine again', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    store.tick(new Date());
    expect(phone.rightAgain).toHaveBeenCalled();
  });

  it('marks it straight away when counting is turned off', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    store.turnOffScreenTime();
    expect(store.get().doc.day.uncounted).toBe(true);
    expect(store.get().doc.watching).toBe(false);
  });
});

describe('locked settings', () => {
  it('locks the settings while the battery is empty', async () => {
    const phone = fakePhone();
    const { store, settingsLocked } = load(phone, saved(180));
    await store.start();
    expect(settingsLocked()).toBe(true);
    store.stepGoal(1);
    expect(store.get().doc.settings.goalMinutes).toBe(180);
  });

  it('leaves them open while setup holds the locks', async () => {
    const phone = fakePhone();
    phone.locksHeldUntil = jest.fn(() => Date.now() + 3600 * 1000);
    const { store, settingsLocked } = load(phone, saved(240));
    await store.start();
    expect(settingsLocked()).toBe(false);
    // Open, but a higher goal still waits for the recharge (goal.ts).
    store.stepGoal(1);
    expect(store.get().doc.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 195 });
  });

  it('lets the day setup finished in change the goal at once, "start tomorrow" too', async () => {
    const phone = fakePhone();
    phone.locksHeldUntil = jest.fn(() => Date.now() + 3600 * 1000);
    const raw = saved(240);
    const { store } = load(phone, { ...raw, day: { ...raw.day, firstDay: true } });
    await store.start();
    store.stepGoal(1);
    expect(store.get().doc.settings.goalMinutes).toBe(195);
    expect(store.get().doc.settings.nextGoalMinutes).toBeUndefined();
  });

  it('leaves them open with cells left', async () => {
    const { store, settingsLocked } = load(fakePhone(), saved(60));
    await store.start();
    expect(settingsLocked()).toBe(false);
  });
});

describe('the daily goal', () => {
  /** A saved copy from the battery before this morning's recharge, with a 4-hour goal waiting for it. */
  function waitingSinceYesterday(used: number) {
    const raw = saved(used);
    const start = new Date(raw.day.periodStart);
    start.setDate(start.getDate() - 1);
    return { ...raw, settings: { ...raw.settings, nextGoalMinutes: 240 }, day: { ...raw.day, periodStart: start.toISOString(), startGoalMinutes: 180 } };
  }
  const plans = (phone: Fake) => (phone.applyPlan as jest.Mock).mock.calls.map((call) => (call[0] as { goalMinutes: number }).goalMinutes);

  it('waits for the recharge to raise it, and tells the phone only when today\'s goal changes', async () => {
    const phone = fakePhone();
    const { store, STEP_SETTLE_MS } = load(phone, saved(60));
    await store.start();
    jest.advanceTimersByTime(1000);
    const before = plans(phone).length;
    store.stepGoal(1);
    store.stepGoal(1);
    jest.advanceTimersByTime(1000);
    expect(store.get().doc.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 210 });
    expect(plans(phone).length).toBe(before);
    for (let i = 0; i < 3; i++) store.stepGoal(-1);
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(store.get().doc.settings.goalMinutes).toBe(165);
    expect(store.get().doc.settings.nextGoalMinutes).toBeUndefined();
    expect(plans(phone).slice(before)).toEqual([165]);
  });

  it('tells the phone once the taps have stopped, not on each one', async () => {
    const phone = fakePhone();
    const { store, STEP_SETTLE_MS } = load(phone, saved(60));
    await store.start();
    jest.advanceTimersByTime(1000);
    const before = plans(phone).length;
    for (let i = 0; i < 3; i++) {
      store.stepGoal(-1);
      jest.advanceTimersByTime(1000);
    }
    // A second between taps is still one run of taps.
    expect(plans(phone).length).toBe(before);
    jest.advanceTimersByTime(STEP_SETTLE_MS);
    expect(plans(phone).slice(before)).toEqual([135]);
  });

  it('a change still waiting goes to the phone as soon as the app is left', async () => {
    const phone = fakePhone();
    const { store, STEP_SETTLE_MS, rn } = load(phone, saved(60));
    let changed: ((state: string) => void) | undefined;
    jest.spyOn(rn.AppState, 'addEventListener').mockImplementation((_type, listener) => {
      changed = listener as (state: string) => void;
      return { remove: () => {} } as ReturnType<typeof rn.AppState.addEventListener>;
    });
    await store.start();
    jest.advanceTimersByTime(1000);
    const before = plans(phone).length;
    store.stepGoal(-1);
    changed?.('inactive');
    expect(plans(phone).slice(before)).toEqual([165]);
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(plans(phone).slice(before)).toEqual([165]);
  });

  it('going back up after a lowering takes off the lower goal\'s screens, and never lowers past what is used', async () => {
    const phone = fakePhone();
    // The phone holds whatever goal it was last given.
    let registered = 180;
    phone.applyPlan = jest.fn(async (s: { goalMinutes: number }) => {
      registered = s.goalMinutes;
      return true;
    });
    phone.registeredGoal = jest.fn(() => registered);
    const { store, STEP_SETTLE_MS } = load(phone, saved(140));
    await store.start();
    expect(store.canStepGoal(-1)).toBe(true);
    for (let i = 0; i < 5; i++) store.stepGoal(-1);
    // 2:30 would leave nothing of the battery at 2:20 used.
    expect(store.get().doc.settings.goalMinutes).toBe(150);
    expect(store.canStepGoal(-1)).toBe(false);
    // Back up before the phone was told: it never had the lower goal, so nothing to take off.
    store.stepGoal(1);
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(registered).toBe(165);
    expect(phone.coverAgain).not.toHaveBeenCalled();
    store.stepGoal(-1);
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(registered).toBe(150);
    store.stepGoal(1);
    expect(phone.coverAgain).not.toHaveBeenCalled();
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(phone.coverAgain).toHaveBeenCalledTimes(1);
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.objectContaining({ goalMinutes: 165 }), 0);
    expect(registered).toBe(165);
  });

  it('starts a waiting goal at the recharge, registers the day with it, and takes off what the old goal covered', async () => {
    const phone = fakePhone();
    const { store } = load(phone, waitingSinceYesterday(170));
    await store.start();
    expect(store.get().doc.settings.goalMinutes).toBe(240);
    expect(store.get().doc.settings.nextGoalMinutes).toBeUndefined();
    expect(store.get().doc.history[store.get().doc.history.length - 1]).toMatchObject({ goalMinutes: 180, usedMinutes: 170 });
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.objectContaining({ goalMinutes: 240 }), 0);
    jest.advanceTimersByTime(1000);
    expect(plans(phone)).toContain(240);
  });

  it('puts the covers straight back when the battery is empty under the new goal too', async () => {
    const phone = fakePhone();
    phone.usedSoFar = jest.fn(() => 250);
    const { store } = load(phone, waitingSinceYesterday(170));
    await store.start();
    expect(phone.coverAgain).toHaveBeenCalledWith(true, expect.objectContaining({ goalMinutes: 240 }), 0);
  });

  it('leaves the phone alone when it already has the goal', async () => {
    const phone = fakePhone();
    phone.registeredGoal = jest.fn(() => 240);
    const { store } = load(phone, waitingSinceYesterday(170));
    await store.start();
    jest.advanceTimersByTime(1000);
    expect(phone.coverAgain).not.toHaveBeenCalled();
    expect(plans(phone)).not.toContain(240);
  });

  it('starts it at the recharge while the app is open', async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 22, 0));
    const phone = fakePhone();
    const { store } = load(phone, saved(170));
    await store.start();
    for (let i = 0; i < 4; i++) store.stepGoal(1);
    expect(store.get().doc.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 240 });
    jest.setSystemTime(new Date(2026, 10, 21, 6, 1));
    store.tick(new Date());
    expect(store.get().doc.settings.goalMinutes).toBe(240);
    expect(store.get().doc.day.startGoalMinutes).toBe(240);
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.objectContaining({ goalMinutes: 240 }), 0);
    jest.advanceTimersByTime(1000);
    expect(plans(phone)).toContain(240);
  });

  it('changes freely on the day setup finished in', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(170, { setupDone: false }));
    await store.start();
    store.startCounting();
    expect(store.get().doc.day.firstDay).toBe(true);
    for (let i = 0; i < 4; i++) store.stepGoal(1);
    expect(store.get().doc.settings.goalMinutes).toBe(240);
    expect(store.get().doc.settings.nextGoalMinutes).toBeUndefined();
  });

  it('gives no free day to a phone that was already through setup', async () => {
    const { store } = load(fakePhone(), saved(30));
    await store.start();
    store.finishSetup();
    expect(store.get().doc.day.firstDay).toBeUndefined();
  });
});

describe('picks over the 50-app lock limit', () => {
  it('rewrites old picks at start-up and treats it as a change of picks', async () => {
    const phone = fakePhone();
    phone.fixOldPicks = jest.fn(() => 'fixed');
    phone.picksAfter = jest.fn(() => true);
    const { store } = load(phone, saved(60));
    await store.start();
    expect(phone.picksAfter).toHaveBeenCalled();
    // Cells left: no covers are up, so none are put back.
    expect(phone.coverAgain).not.toHaveBeenCalled();
  });

  it('puts the covers up again from the new picks while the battery is empty', async () => {
    const phone = fakePhone();
    phone.picksAfter = jest.fn(() => true);
    const { store } = load(phone, saved(180));
    await store.start();
    store.picksChanged();
    expect(phone.coverAgain).toHaveBeenCalledWith(true, expect.objectContaining({ goalMinutes: 180 }), 0);
  });

  it('leaves them off while earned time runs', async () => {
    const phone = fakePhone();
    phone.picksAfter = jest.fn(() => true);
    const { store } = load(phone, saved(180));
    await store.start();
    // Earned time, as the puzzle grants it.
    store.earnTopUp();
    expect(store.get().doc.day.unlockedUntil).not.toBeNull();
    store.picksChanged();
    expect(phone.coverAgain).toHaveBeenLastCalledWith(false, expect.anything(), expect.any(Number));
  });

  it('when new picks leave charge in the battery, the covers come off once the earned time has run out', async () => {
    const phone = fakePhone();
    phone.picksAfter = jest.fn(() => true);
    const { store } = load(phone, saved(180));
    await store.start();
    store.earnTopUp();
    store.picksChanged();
    // The phone re-reports the day for the new picks: what the new essentials used today no longer counts.
    phone.usedSoFar = jest.fn(() => 150);
    jest.advanceTimersByTime(20 * 60_000);
    (phone.coverAgain as jest.Mock).mockClear();
    store.tick(new Date());
    expect(store.get().doc.day.usedMinutes).toBe(150);
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.anything(), expect.any(Number));
  });

  it('does not mark the day for too many apps: counting still works', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(40));
    await store.start();
    phone.health = jest.fn(() => 'tooManyApps');
    phone.wrongSince = jest.fn((now: number) => now - 60 * 60 * 1000);
    store.tick(new Date());
    expect(store.get().doc.day.uncounted).toBe(false);
  });
});

describe('turning counting on', () => {
  it('says "denied" when access is refused, and leaves counting off', async () => {
    const phone = fakePhone();
    phone.isOn = jest.fn(() => false);
    phone.askPermission = jest.fn(async () => 'denied');
    const { store } = load(phone, saved(0, { watching: false }));
    await store.start();
    expect(await store.turnOnScreenTime()).toBe('denied');
    expect(store.get().doc.watching).toBe(false);
    expect(phone.applyPlan).not.toHaveBeenCalled();
  });

  it('says "failed" when the phone will not register the day', async () => {
    const phone = fakePhone();
    phone.isOn = jest.fn(() => false);
    phone.applyPlan = jest.fn(async () => false);
    const { store } = load(phone, saved(0, { watching: false }));
    await store.start();
    expect(await store.turnOnScreenTime()).toBe('failed');
    expect(store.get().doc.watching).toBe(false);
  });
});

describe('Ask first', () => {
  it('is put on the phone at start and when its settings change, and kept with the settings', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(30), ask);
    await store.start();
    expect(ask.applyAskFirst).toHaveBeenCalledTimes(1);
    store.setPro(true, true);
    store.setAskFirst({ on: true, openMinutes: 15, whileInUse: false });
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 15, whileInUse: false });
    expect(ask.applyAskFirst).toHaveBeenLastCalledWith({ on: true, openMinutes: 15, whileInUse: false }, { empty: false, recharge: expect.any(String) });
  });

  it('starts on "Until I leave it" for someone who has never chosen an open time', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(30), ask);
    await store.start();
    store.askPicksChanged(3);
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 10, whileInUse: true });
    expect(ask.applyAskFirst).toHaveBeenLastCalledWith({ on: true, openMinutes: 10, whileInUse: true }, { empty: false, recharge: expect.any(String) });
  });

  it('turns on when apps are picked in Apple\'s list, keeps the open time, and turns off when the list is emptied', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(30), ask);
    await store.start();
    store.setAskFirst({ openMinutes: 15, whileInUse: false });
    store.askPicksChanged(3);
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 15, whileInUse: false });
    expect(ask.applyAskFirst).toHaveBeenLastCalledWith({ on: true, openMinutes: 15, whileInUse: false }, { empty: false, recharge: expect.any(String) });
    store.setAskFirst({ on: false });
    expect(store.get().doc.settings.askFirst).toEqual({ on: false, openMinutes: 15, whileInUse: false });
    store.askPicksChanged(0);
    expect(store.get().doc.settings.askFirst).toEqual({ on: false, openMinutes: 15, whileInUse: false });
    store.askPicksChanged(2);
    expect(store.get().doc.settings.askFirst?.on).toBe(true);
    store.askPicksChanged(0);
    expect(store.get().doc.settings.askFirst?.on).toBe(false);
  });

  it('"Until I leave it" is one of the open choices: kept, sent to the phone, and a number chosen later takes its place', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(30), ask);
    await store.start();
    store.setAskFirst({ on: true, openMinutes: 15 });
    store.setAskFirst({ whileInUse: true });
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 15, whileInUse: true });
    expect(ask.applyAskFirst).toHaveBeenLastCalledWith({ on: true, openMinutes: 15, whileInUse: true }, { empty: false, recharge: expect.any(String) });
    await store.openAskFirst();
    expect(ask.openAsk).toHaveBeenLastCalledWith({ on: true, openMinutes: 15, whileInUse: true }, expect.any(Number), expect.any(Date));
    store.setAskFirst({ openMinutes: 5, whileInUse: false });
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 5, whileInUse: false });
  });

  it('is left alone while counting is off', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(30, { watching: false }), ask);
    phone.isOn = jest.fn(() => false);
    await store.start();
    store.setAskFirst({ on: true });
    expect(ask.applyAskFirst).not.toHaveBeenCalled();
  });

  it('opening it while the battery is empty puts the battery\'s covers back, so counted apps stay locked', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(180, { settings: { goalMinutes: 180, rechargeMinute: 360, countMode: 'custom', emptyLevel: 'work', allowed: [], askFirst: { on: true, openMinutes: 10 } } }), ask);
    await store.start();
    (phone.coverEmptyNow as jest.Mock).mockClear();
    expect(await store.openAskFirst()).not.toBeNull();
    expect(ask.openAsk).toHaveBeenCalledWith({ on: true, openMinutes: 10 }, expect.any(Number), expect.any(Date));
    expect(phone.coverEmptyNow).toHaveBeenCalledTimes(1);
  });

  it('opening it with charge left touches nothing of the battery\'s', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(40), ask);
    await store.start();
    (phone.coverEmptyNow as jest.Mock).mockClear();
    await store.openAskFirst();
    expect(phone.coverEmptyNow).not.toHaveBeenCalled();
  });

  it('never stops the app from starting, even if the phone throws', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    phone.permission = jest.fn(() => {
      throw new Error('no');
    });
    const { store } = load(phone, saved(30), ask);
    await store.start();
    expect(store.get().state).toBe('ready');
  });
});

describe('emergency passes', () => {
  it('a new record starts with one pass; using it opens the settings and everything for 15 minutes, once a day', async () => {
    const phone = fakePhone();
    const { store, settingsLocked } = load(phone, saved(180));
    await store.start();
    expect(store.get().doc.record?.passes).toBe(1);
    expect(settingsLocked()).toBe(true);
    expect(store.passCheck()).toBe('ok');
    expect(store.usePass()).toBe(true);
    const doc = store.get().doc;
    expect(doc.record?.passes).toBe(0);
    expect(doc.day.unlockedUntil).toBe(doc.record?.passUntil);
    expect(phone.grantExtraTime).toHaveBeenCalledTimes(1);
    expect(settingsLocked()).toBe(false);
    // Not twice in a battery's day, whatever is in the bank.
    expect(store.usePass()).toBe(false);
    expect(store.passCheck()).toBe('running');
  });

  it('a pass opens the Second thought apps for its 15 minutes, whatever their own open choice', async () => {
    const phone = fakePhone();
    const ask = fakeAsk();
    const { store } = load(phone, saved(180, { settings: { goalMinutes: 180, rechargeMinute: 360, countMode: 'custom', emptyLevel: 'work', allowed: [], askFirst: { on: true, openMinutes: 5, whileInUse: true } } }), ask);
    await store.start();
    expect(store.usePass()).toBe(true);
    expect(ask.openAsk).toHaveBeenLastCalledWith({ on: true, openMinutes: 15, whileInUse: false }, expect.any(Number), expect.any(Date));
  });

  /** A phone that holds whatever goal it was last given, and the store on an empty battery (3:20 used of 3:00) with the pass just used. */
  async function passUsed() {
    const phone = fakePhone();
    let registered = 180;
    phone.applyPlan = jest.fn(async (s: { goalMinutes: number }) => {
      registered = s.goalMinutes;
      return true;
    });
    phone.registeredGoal = jest.fn(() => registered);
    const loaded = load(phone, saved(200));
    await loaded.store.start();
    jest.advanceTimersByTime(1000);
    expect(loaded.store.usePass()).toBe(true);
    // Start-up covered the empty battery; only what comes after the pass matters here.
    (phone.coverEmptyNow as jest.Mock).mockClear();
    return { phone, ...loaded, registered: () => registered };
  }

  it('while it runs, more time starts today; a battery that outlasts the pass takes over from it, covering nothing', async () => {
    const { phone, store, settingsLocked, STEP_SETTLE_MS, registered } = await passUsed();
    expect(settingsLocked()).toBe(false);
    expect(store.canStepGoal(1)).toBe(true);
    for (let i = 0; i < 4; i++) store.stepGoal(1);
    expect(store.get().doc.settings.goalMinutes).toBe(240);
    expect(store.get().doc.settings.nextGoalMinutes).toBeUndefined();
    expect(phone.endExtraTime).not.toHaveBeenCalled();
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    // 40 minutes of battery outlast the pass's 15: the pass's timer stops without covering, and the battery goes on.
    expect(registered()).toBe(240);
    expect(phone.endExtraTime).toHaveBeenCalledTimes(1);
    expect(store.get().doc.day.unlockedUntil).toBeNull();
    expect(phone.coverAgain).toHaveBeenLastCalledWith(false, expect.objectContaining({ goalMinutes: 240 }), 0);
    // The settings stay open for the rest of the pass, and after it too while the battery has charge.
    expect(store.passCheck()).toBe('running');
    jest.advanceTimersByTime(16 * 60_000);
    store.tick(new Date());
    expect(settingsLocked()).toBe(false);
    expect(phone.coverEmptyNow).not.toHaveBeenCalled();
  });

  it('a raise that gives less than the pass has left lets the pass run; with charge left at its end, the covers come off once', async () => {
    const { phone, store, STEP_SETTLE_MS, registered } = await passUsed();
    store.stepGoal(1);
    store.stepGoal(1);
    jest.advanceTimersByTime(STEP_SETTLE_MS + 100);
    expect(registered()).toBe(210);
    expect(phone.endExtraTime).not.toHaveBeenCalled();
    expect(store.get().doc.day.unlockedUntil).not.toBeNull();
    // The phone covers the apps by the clock as the pass ends; the app finds 10 minutes left in the battery.
    jest.advanceTimersByTime(16 * 60_000);
    (phone.coverAgain as jest.Mock).mockClear();
    store.tick(new Date());
    store.tick(new Date());
    expect(phone.coverAgain).toHaveBeenCalledTimes(1);
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.objectContaining({ goalMinutes: 210 }), 0);
    expect(phone.coverEmptyNow).not.toHaveBeenCalled();
  });

  it('ending on a battery still empty, the covers stay up', async () => {
    const { phone, store } = await passUsed();
    jest.advanceTimersByTime(16 * 60_000);
    (phone.coverAgain as jest.Mock).mockClear();
    store.tick(new Date());
    expect(phone.coverEmptyNow).toHaveBeenCalledTimes(1);
    expect(phone.coverAgain).not.toHaveBeenCalled();
  });

  it('without a pass, more time still waits for the recharge', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(100));
    await store.start();
    store.stepGoal(1);
    expect(store.get().doc.settings).toMatchObject({ goalMinutes: 180, nextGoalMinutes: 195 });
  });

  it('with none in the bank, nothing opens', async () => {
    const phone = fakePhone();
    const now = new Date();
    const record = { passes: 0, lastAdded: '2099-01-05', since: now.toISOString(), uses: [], passUntil: null };
    const { store } = load(phone, saved(180, { record }));
    await store.start();
    expect(store.passCheck()).toBe('none');
    expect(store.usePass()).toBe(false);
    expect(phone.grantExtraTime).not.toHaveBeenCalled();
  });
});

describe('Pro', () => {
  const withAsk = (on: boolean) => saved(30, { settings: { goalMinutes: 180, rechargeMinute: 360, countMode: 'custom', emptyLevel: 'work', allowed: [], askFirst: { on, openMinutes: 10 } } });

  it('without it, the recharge time stays, sums stay normal and Second thought can\'t be switched on; the ready-made lock messages are free, own words are not', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(30));
    await store.start();
    store.setPro(false, true);
    store.stepRecharge(1);
    store.setSumLevel('hard');
    expect(store.get().doc.settings.rechargeMinute).toBe(360);
    expect(store.get().doc.settings.sumLevel).toBe('normal');
    const before = store.get().doc.settings.askFirst;
    store.setAskFirst({ on: true, openMinutes: 15, whileInUse: false });
    store.askPicksChanged(3);
    expect(store.get().doc.settings.askFirst).toEqual(before);
    expect(await store.openAskFirst()).toBeNull();
    store.setLockMessage('  Go   outside. ');
    expect(store.get().doc.settings.lockMessage).toBeUndefined();
    store.setLockMessage('  Text someone   you miss. ');
    expect(store.get().doc.settings.lockMessage).toBe('Text someone you miss.');
    expect(phone.refreshScreens).toHaveBeenCalledWith(expect.objectContaining({ lockMessage: 'Text someone you miss.' }), 0);
    store.setLockMessage('');
    expect(store.get().doc.settings.lockMessage).toBeUndefined();
  });

  it('with it, the lock message can be words of one\'s own', async () => {
    const { store } = load(fakePhone(), saved(30));
    await store.start();
    store.setPro(true, true);
    store.setLockMessage('  Go   outside. ');
    expect(store.get().doc.settings.lockMessage).toBe('Go outside.');
  });

  it('with it, the recharge time and the sums change', async () => {
    const { store } = load(fakePhone(), saved(30));
    await store.start();
    store.setPro(true, true);
    store.stepRecharge(1);
    store.setSumLevel('hard');
    // The new time waits for this battery to end (recharge.ts).
    expect(store.get().doc.settings).toMatchObject({ rechargeMinute: 360, nextRechargeMinute: 390, sumLevel: 'hard' });
  });

  it('a new recharge time waits for this battery to end, without telling the phone, and starts after it', async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 15, 0));
    const phone = fakePhone();
    const { store } = load(phone, saved(30));
    await store.start();
    store.setPro(true, true);
    jest.advanceTimersByTime(1000);
    const before = (phone.applyPlan as jest.Mock).mock.calls.length;
    const start = store.get().doc.day.periodStart;
    // 6:00 to 4:00 AM: the next battery starts at 6:00 as planned, counted from 4:00.
    for (let i = 0; i < 4; i++) store.stepRecharge(-1);
    jest.advanceTimersByTime(1000);
    expect(store.get().doc.settings).toMatchObject({ rechargeMinute: 360, nextRechargeMinute: 240 });
    expect(store.get().doc.day.periodStart).toBe(start);
    expect((phone.applyPlan as jest.Mock).mock.calls.length).toBe(before);
    jest.setSystemTime(new Date(2026, 10, 21, 6, 5));
    store.tick(new Date());
    expect(store.get().doc.settings.rechargeMinute).toBe(240);
    expect(store.get().doc.settings.nextRechargeMinute).toBeUndefined();
    expect(store.get().doc.day.periodStart).toBe(new Date(2026, 10, 21, 4, 0).toISOString());
    expect(store.get().doc.history[store.get().doc.history.length - 1].start).toBe(start);
    expect(phone.coverAgain).toHaveBeenCalledWith(false, expect.objectContaining({ rechargeMinute: 240 }), 0);
    jest.advanceTimersByTime(1000);
    expect((phone.applyPlan as jest.Mock).mock.calls.slice(before).map((c) => (c[0] as { rechargeMinute: number }).rechargeMinute)).toContain(240);
  });

  it('a later recharge time lets this battery run on to it', async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 15, 0));
    const phone = fakePhone();
    const { store } = load(phone, saved(30));
    await store.start();
    store.setPro(true, true);
    for (let i = 0; i < 4; i++) store.stepRecharge(1);
    expect(store.get().doc.settings.nextRechargeMinute).toBe(480);
    jest.setSystemTime(new Date(2026, 10, 21, 6, 5));
    store.tick(new Date());
    // Still the same battery, now counted from 8:00 the day before, until 8:00.
    expect(store.get().doc.settings.rechargeMinute).toBe(480);
    expect(store.get().doc.day.periodStart).toBe(new Date(2026, 10, 20, 8, 0).toISOString());
    expect(store.get().doc.history).toEqual([]);
    jest.setSystemTime(new Date(2026, 10, 21, 8, 1));
    store.tick(new Date());
    expect(store.get().doc.day.periodStart).toBe(new Date(2026, 10, 21, 8, 0).toISOString());
    expect(store.get().doc.history).toHaveLength(1);
  });

  it('on setup\'s own day, a new recharge time is at once', async () => {
    const phone = fakePhone();
    const raw = saved(30);
    const { store } = load(phone, { ...raw, day: { ...raw.day, firstDay: true } });
    await store.start();
    store.setPro(true, true);
    store.stepRecharge(1);
    expect(store.get().doc.settings.rechargeMinute).toBe(390);
    expect(store.get().doc.settings.nextRechargeMinute).toBeUndefined();
  });

  it('keeps a recharge time chosen before Pro existed', async () => {
    const { store } = load(fakePhone(), saved(30, { settings: { goalMinutes: 180, rechargeMinute: 420, countMode: 'custom', emptyLevel: 'work', allowed: [] } }));
    await store.start();
    store.setPro(false, true);
    expect(store.get().doc.settings.rechargeMinute).toBe(420);
  });

  it('when the phone is known not to have Pro, Second thought stops running with its choices kept, and runs again once Pro is back; the lock message stays', async () => {
    const ask = fakeAsk();
    const { store } = load(fakePhone(), withAsk(true), ask);
    await store.start();
    store.setPro(true, true);
    store.setLockMessage('Go outside.');
    const applied = (ask.applyAskFirst as jest.Mock).mock.calls.length;
    // A refund, or "Act as the free version".
    store.setPro(false, true);
    expect(ask.allowAskFirst).toHaveBeenLastCalledWith(false);
    expect((ask.applyAskFirst as jest.Mock).mock.calls.length).toBe(applied + 1);
    expect(store.get().doc.settings.askFirst).toEqual({ on: true, openMinutes: 10 });
    expect(store.get().doc.settings.lockMessage).toBe('Go outside.');
    // A pass no longer opens a list that isn't running.
    (ask.openAsk as jest.Mock).mockClear();
    store.usePass();
    expect(ask.openAsk).not.toHaveBeenCalled();
    store.setPro(true, true);
    expect(ask.allowAskFirst).toHaveBeenLastCalledWith(true);
    expect((ask.applyAskFirst as jest.Mock).mock.calls.length).toBe(applied + 2);
  });

  it('takes nothing of Second thought away before Pro\'s answer has been read', async () => {
    const ask = fakeAsk();
    const { store } = load(fakePhone(), withAsk(true), ask);
    await store.start();
    const applied = (ask.applyAskFirst as jest.Mock).mock.calls.length;
    // The app has started and the saved answer is not in yet.
    store.setPro(false, false);
    expect(ask.allowAskFirst).not.toHaveBeenCalledWith(false);
    expect((ask.applyAskFirst as jest.Mock).mock.calls.length).toBe(applied);
    expect(await store.openAskFirst()).not.toBeNull();
  });
});

describe('essentials that wait for the recharge', () => {
  it('the first look at a battery starts what waits for it, once, and treats it as a change of picks', async () => {
    const phone = fakePhone();
    phone.startWaitingPicks = jest.fn(() => true);
    phone.picksAfter = jest.fn(() => true);
    const { store } = load(phone, saved(60));
    await store.start();
    expect(phone.startWaitingPicks).toHaveBeenCalledTimes(1);
    expect(phone.startWaitingPicks).toHaveBeenCalledWith(true);
    expect(phone.picksAfter).toHaveBeenCalled();
    expect(store.get().doc.day.essentialsNoted).toBe(true);
    // Not again on the same battery.
    store.tick(new Date());
    jest.advanceTimersByTime(60_000);
    store.tick(new Date());
    expect(phone.startWaitingPicks).toHaveBeenCalledTimes(1);
  });

  it('a battery already looked at is left alone', async () => {
    const phone = fakePhone();
    const raw = saved(60);
    const { store } = load(phone, { ...raw, day: { ...raw.day, essentialsNoted: true } });
    await store.start();
    store.tick(new Date());
    expect(phone.startWaitingPicks).not.toHaveBeenCalled();
  });

  it('the recharge starts them again for the new battery', async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 9, 0));
    const phone = fakePhone();
    const raw = saved(60);
    const { store } = load(phone, { ...raw, day: { ...raw.day, essentialsNoted: true } });
    await store.start();
    expect(phone.startWaitingPicks).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(2026, 10, 21, 6, 1));
    store.tick(new Date());
    expect(store.get().doc.day.periodStart).toBe(new Date(2026, 10, 21, 6, 0).toISOString());
    expect(phone.startWaitingPicks).toHaveBeenCalledTimes(1);
    expect(store.get().doc.day.essentialsNoted).toBe(true);
  });

  it('a new essential waits on an ordinary day, and starts at once on setup\'s own day or under a pass', async () => {
    const phone = fakePhone();
    const { store } = load(phone, saved(60));
    await store.start();
    store.essentialsClosed();
    expect(phone.essentialsAfter).toHaveBeenLastCalledWith(false);
    store.appsShownClosed();
    expect(phone.appsAfter).toHaveBeenLastCalledWith(false);

    const first = fakePhone();
    const raw = saved(60);
    const day1 = load(first, { ...raw, day: { ...raw.day, firstDay: true } });
    await day1.store.start();
    day1.store.essentialsClosed();
    expect(first.essentialsAfter).toHaveBeenLastCalledWith(true);

    const pass = fakePhone();
    const empty = load(pass, saved(180));
    await empty.store.start();
    expect(empty.store.usePass()).toBe(true);
    empty.store.essentialsClosed();
    expect(pass.essentialsAfter).toHaveBeenLastCalledWith(true);
    empty.store.appsShownClosed();
    expect(pass.appsAfter).toHaveBeenLastCalledWith(true);
  });

  it('using a pass starts the ones that wait: a pass skips the wait', async () => {
    const phone = fakePhone();
    const raw = saved(180);
    const { store } = load(phone, { ...raw, day: { ...raw.day, essentialsNoted: true } });
    await store.start();
    phone.startWaitingPicks = jest.fn(() => true);
    phone.picksAfter = jest.fn(() => true);
    expect(store.usePass()).toBe(true);
    expect(phone.startWaitingPicks).toHaveBeenCalledWith(false);
    expect(phone.picksAfter).toHaveBeenCalled();
    // The pass has the apps open: the covers are not put back up for the new list.
    expect(phone.coverAgain).toHaveBeenLastCalledWith(false, expect.anything(), expect.any(Number));
  });

  it('a recharge that passed while Apple\'s list was open comes first', async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 23, 0));
    const phone = fakePhone();
    const order: string[] = [];
    phone.startWaitingPicks = jest.fn(() => {
      order.push('day');
      return false;
    });
    phone.essentialsAfter = jest.fn(() => {
      order.push('picked');
      return 0;
    });
    const raw = saved(60);
    const { store } = load(phone, { ...raw, day: { ...raw.day, essentialsNoted: true } });
    await store.start();
    jest.setSystemTime(new Date(2026, 10, 21, 6, 0, 30));
    store.essentialsClosed();
    expect(order).toEqual(['day', 'picked']);
  });

  it('a phone that throws while starting them is tried again on the next look', async () => {
    const phone = fakePhone();
    let broken = true;
    phone.startWaitingPicks = jest.fn(() => {
      if (broken) throw new Error('native module gone');
      return false;
    });
    const { store } = load(phone, saved(60));
    await store.start();
    expect(store.get().state).toBe('ready');
    expect(store.get().doc.day.essentialsNoted).toBeUndefined();
    broken = false;
    store.tick(new Date());
    expect(store.get().doc.day.essentialsNoted).toBe(true);
  });
});
