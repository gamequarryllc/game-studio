import { asCovered, COVERED_FRESH_MS, KNOWN_LINKS, linkFor } from '../appLinks';

const NOW = Date.UTC(2026, 10, 22, 2, 30);

describe('the note of the covered app', () => {
  it('is believed while it is fresh', () => {
    expect(asCovered({ name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', at: NOW - 20_000 }, NOW)).toEqual({ name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', at: NOW - 20_000 });
    expect(asCovered({ name: 'Snapchat', bundle: '', at: NOW - COVERED_FRESH_MS }, NOW)).not.toBeNull();
  });

  it('is dropped once it is old: a sum reached much later may be for another app', () => {
    expect(asCovered({ name: 'Snapchat', bundle: '', at: NOW - COVERED_FRESH_MS - 1 }, NOW)).toBeNull();
  });

  it('is nothing when nothing usable was noted', () => {
    expect(asCovered(undefined, NOW)).toBeNull();
    expect(asCovered('Snapchat', NOW)).toBeNull();
    expect(asCovered({ name: 'Snapchat' }, NOW)).toBeNull();
    // A website's covering screen notes no app.
    expect(asCovered({ name: '', bundle: '', at: NOW }, NOW)).toBeNull();
    // From the future by more than a clock's wobble.
    expect(asCovered({ name: 'Snapchat', bundle: '', at: NOW + 5 * 60_000 }, NOW)).toBeNull();
    expect(asCovered({ name: 'Snapchat', bundle: '', at: NOW + 30_000 }, NOW)).not.toBeNull();
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
