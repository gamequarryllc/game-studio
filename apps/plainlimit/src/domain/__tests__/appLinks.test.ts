import { appAfter, asCovered, asTapped, COVERED_FRESH_MS, JUST_DRAWN_MS, KNOWN_LINKS, linkFor, PRESS_FRESH_MS, readout, type Covered, type Tapped } from '../appLinks';

const NOW = Date.UTC(2026, 10, 22, 2, 30);
const HOUR = 3_600_000;

const drawn = (over: Partial<Covered> = {}): Covered => ({ name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', key: 'code-snap', category: '', at: NOW - 20_000, ...over });
const press = (over: Partial<Tapped> = {}): Tapped => ({ kind: 'app', key: 'code-snap', name: '', bundle: '', at: NOW - 15_000, ...over });

describe('the notes as they were saved', () => {
  it("reads the screen's note, with or without the codes a later build added", () => {
    expect(asCovered({ name: ' Snapchat ', bundle: 'com.toyopagroup.picaboo', key: 'abc', category: 'soc', at: NOW })).toEqual({ name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', key: 'abc', category: 'soc', at: NOW });
    expect(asCovered({ name: 'Snapchat', bundle: '', at: NOW })).toEqual({ name: 'Snapchat', bundle: '', key: '', category: '', at: NOW });
  });

  it("reads the press's note", () => {
    expect(asTapped({ kind: 'app', key: 'abc', name: '', bundle: '', at: NOW })).toEqual({ kind: 'app', key: 'abc', name: '', bundle: '', at: NOW });
    expect(asTapped({ kind: 'category', key: 'soc', at: NOW })?.kind).toBe('category');
  });

  it('is nothing when what was saved is not a note', () => {
    for (const saved of [undefined, null, 'Snapchat', 7, { name: 'Snapchat' }, { name: 'Snapchat', at: 'now' }, { name: 'Snapchat', at: NaN }]) {
      expect(asCovered(saved)).toBeNull();
      expect(asTapped(saved)).toBeNull();
    }
    expect(asTapped({ kind: 'something else', key: 'abc', at: NOW })).toBeNull();
  });
});

describe('which app the sum is for', () => {
  it("is the one the screen noted when the press has the same code, however long ago the screen was drawn", () => {
    // The phone showed a screen it drew hours ago and did not ask again: the first build gave up here.
    expect(appAfter(NOW, press(), [drawn({ at: NOW - 9 * HOUR })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press(), [drawn({ at: NOW - 9 * HOUR })]).why).toBe('the same app as the press');
  });

  it('still goes by the press when the notification is tapped a while later', () => {
    // Pressed, put the phone down, tapped the notification half an hour on.
    const late = press({ at: NOW - 30 * 60_000 });
    expect(appAfter(NOW, late, [drawn({ at: NOW - 31 * 60_000 })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press({ at: NOW - PRESS_FRESH_MS }), [drawn({ at: NOW - 2 * HOUR })]).app?.name).toBe('Snapchat');
    // Past the hour the press is no longer taken as this sum's, and an old note alone is not believed.
    expect(appAfter(NOW, press({ at: NOW - PRESS_FRESH_MS - 1 }), [drawn({ at: NOW - 2 * HOUR })]).app).toBeNull();
  });

  it('is none when the note is for another app, drawn a while before', () => {
    const chosen = appAfter(NOW, press({ key: 'code-insta' }), [drawn({ at: NOW - 5 * 60_000 })]);
    expect(chosen).toEqual({ app: null, why: 'the note is for another app' });
  });

  it('takes a screen drawn within the minute before the press as the one pressed, even if the codes read differently', () => {
    const at = NOW - 15_000;
    expect(appAfter(NOW, press({ key: 'spelt-another-way', at }), [drawn({ at: at - JUST_DRAWN_MS })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press({ key: 'spelt-another-way', at }), [drawn({ at: at - JUST_DRAWN_MS - 1 })]).app).toBeNull();
  });

  it('looks through both notes, the saved one and the waiting one, newest first', () => {
    const other = drawn({ name: 'Instagram', bundle: 'com.burbn.instagram', key: 'code-insta', at: NOW - 5 * 60_000 });
    expect(appAfter(NOW, press(), [other, drawn({ at: NOW - 2 * HOUR })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press(), [null, drawn()]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, null, [drawn({ at: NOW - 60_000 }), other]).app?.name).toBe('Snapchat');
  });

  it('believes a note for ten minutes when nothing says which app the press was on, as the first build did', () => {
    // No press noted at all, or one too old to be this sum's.
    expect(appAfter(NOW, null, [drawn({ at: NOW - COVERED_FRESH_MS })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, null, [drawn({ at: NOW - COVERED_FRESH_MS - 1 })])).toEqual({ app: null, why: 'the note is too old' });
    expect(appAfter(NOW, press({ key: 'code-insta', at: NOW - PRESS_FRESH_MS - 1 }), [drawn()]).app?.name).toBe('Snapchat');
    // A note from a build that did not note the code yet.
    expect(appAfter(NOW, press(), [drawn({ key: '' })]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press(), [drawn({ key: '', at: NOW - HOUR })]).app).toBeNull();
  });

  it('covered through its category, the press only knows the category: a fresh note of that category is believed', () => {
    const inCategory = drawn({ category: 'code-social' });
    expect(appAfter(NOW, press({ kind: 'category', key: 'code-social' }), [inCategory]).app?.name).toBe('Snapchat');
    expect(appAfter(NOW, press({ kind: 'category', key: 'code-games' }), [inCategory]).app).toBeNull();
    // Another app of the same category may have been drawn since: only while fresh.
    expect(appAfter(NOW, press({ kind: 'category', key: 'code-social' }), [drawn({ category: 'code-social', at: NOW - HOUR })]).app).toBeNull();
  });

  it('is the app the press itself names, where iOS gives the name there', () => {
    const chosen = appAfter(NOW, press({ name: 'Instagram', bundle: 'com.burbn.instagram' }), [drawn()]);
    expect(chosen.app?.name).toBe('Instagram');
    expect(chosen.why).toBe('the press named it');
  });

  it('is none for a press on a website, when no app was noted, or for a note from the future', () => {
    expect(appAfter(NOW, press({ kind: 'site' }), [drawn()])).toEqual({ app: null, why: 'the press was on a website' });
    expect(appAfter(NOW, press(), [null, null])).toEqual({ app: null, why: 'the lock screen noted no app' });
    // A website's covering screen notes no app.
    expect(appAfter(NOW, null, [drawn({ name: '', bundle: '', key: '' })]).app).toBeNull();
    // From the future by more than a clock's wobble.
    expect(appAfter(NOW, null, [drawn({ at: NOW + 5 * 60_000 })]).app).toBeNull();
    expect(appAfter(NOW, null, [drawn({ at: NOW + 30_000 })]).app?.name).toBe('Snapchat');
  });
});

describe('the readout', () => {
  it('says what each note held and what came of it', () => {
    const tapped = press();
    const saved = drawn();
    const chosen = appAfter(NOW, tapped, [saved, null]);
    expect(readout(NOW, tapped, saved, null, chosen, linkFor(saved))).toEqual([
      'Lock screen noted: Snapchat, 20 s ago, same code',
      'Waiting note: nothing',
      'Button press noted: an app, 15 s ago',
      'Opens: Snapchat (the same app as the press)',
    ]);
  });

  it('says when nothing was noted, and when the app has no link', () => {
    expect(readout(NOW, null, null, null, appAfter(NOW, null, []), null)).toEqual([
      'Lock screen noted: nothing',
      'Waiting note: nothing',
      'Button press noted: nothing',
      'Opens: nothing (the lock screen noted no app)',
    ]);
    const game = drawn({ name: 'Some Small Game', bundle: 'com.example.smallgame', key: '', at: NOW - 3 * HOUR });
    const waiting = drawn({ name: 'Some Small Game', bundle: 'com.example.smallgame', key: 'code-game', at: NOW - 4 * 60_000 });
    const tapped = press({ key: 'code-game' });
    const lines = readout(NOW, tapped, game, waiting, appAfter(NOW, tapped, [game, waiting]), null);
    expect(lines[0]).toBe('Lock screen noted: Some Small Game, no code, 3 h ago');
    expect(lines[1]).toBe('Waiting note: Some Small Game, 4 min ago, same code');
    expect(lines[3]).toBe('Opens: no link for Some Small Game (the same app as the press)');
  });
});

describe('the link that opens an app', () => {
  it('finds a well-known app by its name', () => {
    expect(linkFor({ name: 'Snapchat', bundle: '' })).toEqual({ name: 'Snapchat', link: 'snapchat://' });
    expect(linkFor({ name: '  instagram ', bundle: '' })).toEqual({ name: 'Instagram', link: 'instagram://' });
    expect(linkFor({ name: 'Twitter', bundle: '' })?.link).toBe('twitter://');
  });

  it('goes by the bundle id first, which does not change with the language', () => {
    expect(linkFor({ name: 'Mensajes', bundle: 'com.apple.MobileSMS' })).toEqual({ name: 'Messages', link: 'messages://' });
    expect(linkFor({ name: 'Something else', bundle: 'COM.BURBN.INSTAGRAM' })?.name).toBe('Instagram');
  });

  it('has none for an app it does not know: the screen then says to go back by hand', () => {
    expect(linkFor({ name: 'Some Small Game', bundle: 'com.example.smallgame' })).toBeNull();
    expect(linkFor({ name: '', bundle: '' })).toBeNull();
  });

  it('only holds links that open an app, each once', () => {
    for (const { name, link } of KNOWN_LINKS) {
      expect(name.length).toBeGreaterThan(0);
      // A scheme and nothing after it: the app opens where it was left.
      expect(link).toMatch(/^[a-z][a-z0-9+.-]*:\/\/$/);
      expect(link.startsWith('http')).toBe(false);
    }
    expect(new Set(KNOWN_LINKS.map((k) => k.name)).size).toBe(KNOWN_LINKS.length);
    expect(new Set(KNOWN_LINKS.map((k) => k.link)).size).toBe(KNOWN_LINKS.length);
  });
});
