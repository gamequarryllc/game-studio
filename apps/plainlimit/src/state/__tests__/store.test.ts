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
    askPermission: jest.fn(async () => 'approved'),
    busyRegistering: jest.fn(() => false),
    clearPicks: jest.fn(),
    countAgain: jest.fn(async () => true),
    coverAgain: jest.fn(),
    fixOldPicks: jest.fn(() => 'fine'),
    coverEmptyNow: jest.fn(),
    grantExtraTime: jest.fn(async () => {}),
    holdLocks: jest.fn(),
    locksHeldUntil: jest.fn(() => 0),
    noteHistoryLoss: jest.fn(),
    noteKnown: jest.fn(),
    onCheckpoint: jest.fn(() => () => {}),
    picksAfter: jest.fn(() => false),
    refreshScreens: jest.fn(),
    releaseLocks: jest.fn(),
    reloadWidget: jest.fn(),
    rightAgain: jest.fn(),
    turnOff: jest.fn(),
    wrongSince: jest.fn((now: number) => now),
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
function load(phone: Fake, raw: unknown) {
  let mod: typeof import('../store') | undefined;
  jest.isolateModules(() => {
    jest.doMock('@/platform/screenTime', () => phone);
    jest.doMock('@/platform/storage', () => ({ readSaved: jest.fn(async () => raw), writeSaved: jest.fn(async () => {}) }));
    mod = require('../store');
  });
  return mod as typeof import('../store');
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
    store.stepGoal(1);
    expect(store.get().doc.settings.goalMinutes).toBe(195);
  });

  it('leaves them open with cells left', async () => {
    const { store, settingsLocked } = load(fakePhone(), saved(60));
    await store.start();
    expect(settingsLocked()).toBe(false);
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
