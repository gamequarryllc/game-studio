// Going straight back to the app after a Second thought sum, against a fake of
// the shared settings: the note the covering screen's extension leaves is
// read, believed only while fresh, and turned into the app's own link.
// (Whether the extension really leaves the note can only be seen on a phone.)

import { Linking } from 'react-native';

function load(saved: Map<string, unknown>) {
  let mod: typeof import('../backToApp') | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-device-activity', () => ({
      __esModule: true,
      userDefaultsGet: (key: string) => saved.get(key),
    }));
    jest.doMock('../screenTime', () => ({ __esModule: true, MOCK_COVERED: false }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../backToApp');
  });
  return mod as typeof import('../backToApp');
}

const now = new Date(2026, 10, 22, 21, 9, 30);
const KEY = 'plainlimit_covered';

afterEach(() => jest.restoreAllMocks());

describe('the app to go back to', () => {
  it('is the one the covering screen just noted', () => {
    const back = load(new Map([[KEY, { name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', at: now.getTime() - 15_000 }]]));
    expect(back.appToReturnTo(now)).toEqual({ name: 'Snapchat', link: 'snapchat://' });
  });

  it('is none when nothing was noted, the note is old, or the app is not one it has a link for', () => {
    expect(load(new Map()).appToReturnTo(now)).toBeNull();
    expect(load(new Map([[KEY, { name: 'Snapchat', bundle: '', at: now.getTime() - 11 * 60_000 }]])).appToReturnTo(now)).toBeNull();
    expect(load(new Map([[KEY, { name: 'Some Small Game', bundle: 'com.example.smallgame', at: now.getTime() }]])).appToReturnTo(now)).toBeNull();
    // A website's covering screen leaves an empty note.
    expect(load(new Map([[KEY, { name: '', bundle: '', at: now.getTime() }]])).appToReturnTo(now)).toBeNull();
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
