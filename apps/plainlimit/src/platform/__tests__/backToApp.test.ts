// Going straight back to the app after a Second thought sum, against a fake of
// the shared settings and of the phone's waiting notifications: the notes the
// covering screen's two extensions leave are read, matched, and turned into
// the app's own link. (Whether the extensions really leave the notes can only
// be seen on a phone; the readout is there to say so.)

import { Linking } from 'react-native';

function load(saved: Map<string, unknown>, waiting?: unknown) {
  let mod: typeof import('../backToApp') | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-device-activity', () => ({
      __esModule: true,
      userDefaultsGet: (key: string) => saved.get(key),
    }));
    jest.doMock('../screenTime', () => ({ __esModule: true, MOCK_COVERED: false }));
    jest.doMock('../notices', () => ({
      __esModule: true,
      waitingData: async (identifier: string) => (identifier === 'plainlimit-covered' ? waiting : undefined),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../backToApp');
  });
  return mod as typeof import('../backToApp');
}

const now = new Date(2026, 10, 22, 21, 9, 30);
const at = now.getTime();
const COVERED = 'plainlimit_covered';
const TAPPED = 'plainlimit_tapped';
const snapchat = { name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', key: 'code-snap', category: '' };

afterEach(() => jest.restoreAllMocks());

describe('the app to go back to', () => {
  it('is the one the covering screen just noted', () => {
    const back = load(new Map([[COVERED, { ...snapchat, at: at - 15_000 }]]));
    expect(back.appToReturnTo(now).app).toEqual({ name: 'Snapchat', link: 'snapchat://' });
  });

  it('is the one whose button was pressed, though its screen was drawn hours ago', () => {
    const back = load(
      new Map<string, unknown>([
        [COVERED, { ...snapchat, at: at - 5 * 3_600_000 }],
        [TAPPED, { kind: 'app', key: 'code-snap', name: '', bundle: '', at: at - 8_000 }],
      ]),
    );
    const found = back.appToReturnTo(now);
    expect(found.app).toEqual({ name: 'Snapchat', link: 'snapchat://' });
    expect(found.readout[3]).toBe('Opens: Snapchat (the same app as the press)');
  });

  it('is none when nothing was noted, the note is old with nothing to match it, or the app is not one it has a link for', () => {
    expect(load(new Map()).appToReturnTo(now).app).toBeNull();
    expect(load(new Map([[COVERED, { name: 'Snapchat', bundle: '', at: at - 11 * 60_000 }]])).appToReturnTo(now).app).toBeNull();
    expect(load(new Map([[COVERED, { name: 'Some Small Game', bundle: 'com.example.smallgame', at }]])).appToReturnTo(now).app).toBeNull();
    // A website's covering screen leaves an empty note.
    expect(load(new Map([[COVERED, { name: '', bundle: '', at }]])).appToReturnTo(now).app).toBeNull();
  });

  it('reads the note left on the waiting notification too, where the shared settings hold none', async () => {
    const tapped = new Map<string, unknown>([[TAPPED, { kind: 'app', key: 'code-snap', name: '', bundle: '', at: at - 8_000 }]]);
    const back = load(tapped, { plainlimitCovered: { ...snapchat, at: at - 12_000 } });
    // At once, from the shared settings alone: nothing yet.
    expect(back.appToReturnTo(now).app).toBeNull();
    const found = await back.appToReturnToWithWaiting(now);
    expect(found.app).toEqual({ name: 'Snapchat', link: 'snapchat://' });
    expect(found.readout.slice(0, 2)).toEqual(['Lock screen noted: nothing', 'Waiting note: Snapchat, 12 s ago, same code']);
  });

  it('is none when the waiting notification carries something else, or there is none', async () => {
    await expect(load(new Map(), { route: '/ask' }).appToReturnToWithWaiting(now)).resolves.toMatchObject({ app: null });
    await expect(load(new Map(), 'Snapchat').appToReturnToWithWaiting(now)).resolves.toMatchObject({ app: null });
    await expect(load(new Map()).appToReturnToWithWaiting(now)).resolves.toMatchObject({ app: null });
  });
});

describe('opening it', () => {
  it('asks the phone to open the link, and says whether it did', async () => {
    const back = load(new Map());
    const open = jest.spyOn(Linking, 'openURL').mockImplementation(async () => {});
    await expect(back.returnTo({ name: 'Snapchat', link: 'snapchat://' })).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('snapchat://');
  });

  it('says no when the phone has no app for the link, so the screen can say to go back by hand', async () => {
    const back = load(new Map());
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no app'));
    await expect(back.returnTo({ name: 'Snapchat', link: 'snapchat://' })).resolves.toBe(false);
  });
});
