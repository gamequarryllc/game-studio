/**
 * Going straight back to the app after a Second thought sum (the owner,
 * 2026-11-22: "it just goes to Plainlimit, and then I have to swipe out of it
 * and then go to Snapchat").
 *
 * iOS gives an app no way to send itself to the Home Screen or back to the
 * app before it. What it does allow is opening another app by that app's own
 * link ("snapchat://"). So two things are needed: which app the person was
 * after, and its link.
 *
 * Which app: Apple's picker only hands over codes, never names. The one place
 * a name is given is the extension that draws the covering screen, which is
 * told the app it is drawing over. It notes that app (name, bundle id and the
 * app's code, replacing the note before) in the settings the app shares with
 * its extensions, and a second time on a notification that is never shown.
 * The extension behind the screen's buttons notes the code of the app whose
 * button was pressed. Neither note leaves the phone.
 *
 * The first build only had the screen's note, believed for ten minutes, and
 * on the owner's phone the sum's button stayed a plain "Open" (build 137).
 * iOS can show a covering screen it drew earlier without asking the extension
 * again, and then nothing fresh is noted. So the press now says which app it
 * is, and a note of the same app is believed whatever its age (`appAfter`).
 *
 * Its link: there is no directory of these, so the table below holds the
 * well-known ones. An app that is not in it, or a link that no longer works,
 * falls back to saying "go back to the one you wanted".
 */

/** What the extension that draws the covering screen noted (plugins/withTargets.js writes the Swift). */
export interface Covered {
  name: string;
  bundle: string;
  /** Apple's code for the app, as text. '' from a build that did not note it yet. */
  key: string;
  /** The code of its category, when it is covered through one. */
  category: string;
  /** When it was noted, in milliseconds. */
  at: number;
}

/** What the extension behind the covering screen's buttons noted at the last press. */
export interface Tapped {
  /** What the pressed screen covers. Through a category, only the category is told. */
  kind: 'app' | 'category' | 'site';
  /** The code of that app or category, as text. */
  key: string;
  /** iOS usually gives no name here; kept in case it does. */
  name: string;
  bundle: string;
  at: number;
}

/** How long a note is believed when nothing says which app it is for. */
export const COVERED_FRESH_MS = 10 * 60_000;
/** How long a press is taken to be the one that sent the sum's notification: the notification may be tapped a while later. */
export const PRESS_FRESH_MS = 60 * 60_000;
/** A screen drawn this shortly before the press is taken to be the one pressed, even if the codes do not read alike. */
export const JUST_DRAWN_MS = 60_000;

/** An app Plainlimit can open: the name to show and the link that opens it. */
export interface AppLink {
  name: string;
  link: string;
}

interface Known extends AppLink {
  bundle: string;
  /** Other names it goes by on the Home Screen. */
  also?: readonly string[];
}

const KNOWN: readonly Known[] = [
  { name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', link: 'snapchat://' },
  { name: 'Instagram', bundle: 'com.burbn.instagram', link: 'instagram://' },
  { name: 'TikTok', bundle: 'com.zhiliaoapp.musically', link: 'tiktok://' },
  { name: 'YouTube', bundle: 'com.google.ios.youtube', link: 'youtube://' },
  { name: 'Facebook', bundle: 'com.facebook.Facebook', link: 'fb://' },
  { name: 'Messenger', bundle: 'com.facebook.Messenger', link: 'fb-messenger://' },
  { name: 'WhatsApp', bundle: 'net.whatsapp.WhatsApp', link: 'whatsapp://' },
  { name: 'X', bundle: 'com.atebits.Tweetie2', link: 'twitter://', also: ['Twitter'] },
  { name: 'Reddit', bundle: 'com.reddit.Reddit', link: 'reddit://' },
  { name: 'Threads', bundle: 'com.burbn.barcelona', link: 'barcelona://' },
  { name: 'Discord', bundle: 'com.hammerandchisel.discord', link: 'discord://' },
  { name: 'Pinterest', bundle: 'pinterest', link: 'pinterest://' },
  { name: 'Twitch', bundle: 'tv.twitch', link: 'twitch://' },
  { name: 'Telegram', bundle: 'ph.telegra.Telegraph', link: 'tg://' },
  { name: 'LinkedIn', bundle: 'com.linkedin.LinkedIn', link: 'linkedin://' },
  { name: 'Tumblr', bundle: 'com.tumblr.tumblr', link: 'tumblr://' },
  { name: 'Bluesky', bundle: 'xyz.blueskyweb.app', link: 'bluesky://' },
  { name: 'Signal', bundle: 'org.whispersystems.signal', link: 'sgnl://' },
  { name: 'WeChat', bundle: 'com.tencent.xin', link: 'weixin://' },
  { name: 'LINE', bundle: 'jp.naver.line', link: 'line://' },
  { name: 'Viber', bundle: 'com.viber', link: 'viber://' },
  { name: 'Tinder', bundle: 'com.cardify.tinder', link: 'tinder://' },
  // Watching and listening.
  { name: 'Netflix', bundle: 'com.netflix.Netflix', link: 'nflx://' },
  { name: 'Disney+', bundle: 'com.disney.disneyplus', link: 'disneyplus://' },
  { name: 'Hulu', bundle: 'com.hulu.plus', link: 'hulu://' },
  { name: 'Prime Video', bundle: 'com.amazon.aiv.AIVApp', link: 'aiv://', also: ['Amazon Prime Video'] },
  { name: 'Crunchyroll', bundle: 'com.crunchyroll.iphone', link: 'crunchyroll://' },
  { name: 'YouTube Music', bundle: 'com.google.ios.youtubemusic', link: 'youtubemusic://' },
  { name: 'Spotify', bundle: 'com.spotify.client', link: 'spotify://' },
  { name: 'SoundCloud', bundle: 'com.soundcloud.TouchApp', link: 'soundcloud://' },
  // Games.
  { name: 'Roblox', bundle: 'com.roblox.robloxmobile', link: 'roblox://' },
  { name: 'Clash Royale', bundle: 'com.supercell.scroll', link: 'clashroyale://' },
  { name: 'Clash of Clans', bundle: 'com.supercell.magic', link: 'clashofclans://' },
  { name: 'Brawl Stars', bundle: 'com.supercell.laser', link: 'brawlstars://' },
  // Shopping, reading and the rest.
  { name: 'Amazon', bundle: 'com.amazon.Amazon', link: 'com.amazon.mobile.shopping://', also: ['Amazon Shopping'] },
  { name: 'eBay', bundle: 'com.ebay.iphone', link: 'ebay://' },
  { name: 'Etsy', bundle: 'com.etsy.etsyforios', link: 'etsy://' },
  { name: 'ChatGPT', bundle: 'com.openai.chat', link: 'chatgpt://' },
  { name: 'Duolingo', bundle: 'com.duolingo.DuolingoMobile', link: 'duolingo://' },
  { name: 'Chrome', bundle: 'com.google.chrome.ios', link: 'googlechrome://' },
  { name: 'Gmail', bundle: 'com.google.Gmail', link: 'googlegmail://' },
  { name: 'Google Maps', bundle: 'com.google.Maps', link: 'comgooglemaps://' },
  { name: 'Outlook', bundle: 'com.microsoft.Office.Outlook', link: 'ms-outlook://' },
  { name: 'Slack', bundle: 'com.tinyspeck.chatlyio', link: 'slack://' },
  { name: 'Kindle', bundle: 'com.amazon.Lassen', link: 'kindle://' },
  { name: 'Audible', bundle: 'com.audible.iphone', link: 'audible://' },
  // Apple's own. Their names change with the phone's language, so the bundle id is what finds them.
  { name: 'Messages', bundle: 'com.apple.MobileSMS', link: 'messages://' },
  { name: 'Mail', bundle: 'com.apple.mobilemail', link: 'message://' },
  { name: 'Music', bundle: 'com.apple.Music', link: 'music://' },
  { name: 'Podcasts', bundle: 'com.apple.podcasts', link: 'podcasts://' },
  { name: 'TV', bundle: 'com.apple.tv', link: 'videos://', also: ['Apple TV'] },
  { name: 'News', bundle: 'com.apple.news', link: 'applenews://' },
  { name: 'Photos', bundle: 'com.apple.mobileslideshow', link: 'photos-redirect://' },
  { name: 'App Store', bundle: 'com.apple.AppStore', link: 'itms-apps://' },
  { name: 'Books', bundle: 'com.apple.iBooks', link: 'ibooks://' },
  { name: 'Stocks', bundle: 'com.apple.stocks', link: 'stocks://' },
];

const plain = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The screen's note as it was saved, if it is one. Its age is judged in `appAfter`. */
export function asCovered(saved: unknown): Covered | null {
  if (!saved || typeof saved !== 'object') return null;
  const r = saved as Record<string, unknown>;
  const at = time(r.at);
  return at === null ? null : { name: text(r.name), bundle: text(r.bundle), key: text(r.key), category: text(r.category), at };
}

/** The press's note as it was saved, if it is one. */
export function asTapped(saved: unknown): Tapped | null {
  if (!saved || typeof saved !== 'object') return null;
  const r = saved as Record<string, unknown>;
  const at = time(r.at);
  const kind = r.kind === 'app' || r.kind === 'category' || r.kind === 'site' ? r.kind : null;
  return at === null || kind === null ? null : { kind, key: text(r.key), name: text(r.name), bundle: text(r.bundle), at };
}

// A minute's grace for a clock that stepped back; nothing from the future beyond that.
const within = (at: number, now: number, span: number) => now - at <= span && at - now <= 60_000;
const named = (app: Pick<Covered, 'name' | 'bundle'>) => app.name !== '' || app.bundle !== '';

/** The app the sum is for, or none, and why in a few words (for the readout). */
export interface Chosen {
  app: Pick<Covered, 'name' | 'bundle'> | null;
  why: string;
}

/**
 * Which app the person was after, from the press's note and the screen's
 * notes (the saved one and the waiting one; either may be missing).
 * - A press older than an hour is not this sum's, and is left out.
 * - A press on a website's screen: no app.
 * - A press that names the app itself settles it.
 * - A press on an app's own screen: the screen's note with the same code,
 *   however old (the phone showed a screen it drew earlier). A note with
 *   another code is another app's, unless it was drawn within the minute
 *   before the press, which is taken as the same screen.
 * - No press, a note without a code, or a press that only knows the category:
 *   the newest note of the last ten minutes, as in the first build.
 */
export function appAfter(now: number, tapped: Tapped | null, drawn: readonly (Covered | null)[]): Chosen {
  const press = tapped && within(tapped.at, now, PRESS_FRESH_MS) ? tapped : null;
  if (press?.kind === 'site') return { app: null, why: 'the press was on a website' };
  if (press && named(press)) return { app: press, why: 'the press named it' };
  const notes = drawn.filter((note): note is Covered => note !== null && named(note) && note.at - now <= 60_000).sort((a, b) => b.at - a.at);
  if (notes.length === 0) return { app: null, why: 'the lock screen noted no app' };
  let why = 'the note is too old';
  for (const note of notes) {
    if (press?.kind === 'app' && press.key !== '' && note.key !== '') {
      if (note.key === press.key) return { app: note, why: 'the same app as the press' };
      const before = press.at - note.at;
      if (before >= -5_000 && before <= JUST_DRAWN_MS) return { app: note, why: 'drawn just before the press' };
      why = 'the note is for another app';
      continue;
    }
    if (press?.kind === 'category' && press.key !== '' && note.category !== '' && note.category !== press.key) {
      why = 'the note is for another app';
      continue;
    }
    if (within(note.at, now, COVERED_FRESH_MS)) return { app: note, why: 'noted in the last 10 minutes' };
  }
  return { app: null, why };
}

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 120) return `${seconds} s ago`;
  if (seconds < 2 * 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/**
 * What each note held and what came of it, in four short lines. Shown on the
 * sum's screen when its heading is pressed and held, so that a phone where the
 * app did not open by itself can say which note was missing: nothing else in
 * a build from TestFlight can.
 */
export function readout(now: number, tapped: Tapped | null, saved: Covered | null, waiting: Covered | null, chosen: Chosen, opens: AppLink | null): string[] {
  const screen = (note: Covered | null) => (note === null ? 'nothing' : `${named(note) ? note.name || note.bundle : 'no app'}${note.key === '' ? ', no code' : ''}, ${ago(note.at, now)}`);
  const match = (note: Covered | null) => (tapped === null || note === null || tapped.key === '' || note.key === '' ? '' : tapped.key === note.key || tapped.key === note.category ? ', same code' : ', other code');
  const press = tapped === null ? 'nothing' : `${tapped.kind === 'app' ? 'an app' : tapped.kind === 'category' ? 'a category' : 'a website'}${named(tapped) ? ` (${tapped.name || tapped.bundle})` : ''}, ${ago(tapped.at, now)}`;
  return [
    `Lock screen noted: ${screen(saved)}${match(saved)}`,
    `Waiting note: ${screen(waiting)}${match(waiting)}`,
    `Button press noted: ${press}`,
    `Opens: ${opens ? opens.name : chosen.app ? `no link for ${chosen.app.name || chosen.app.bundle}` : 'nothing'} (${chosen.why})`,
  ];
}

/** The link for a noted app: by bundle id first (it does not change with the language), then by name. */
export function linkFor(app: Pick<Covered, 'name' | 'bundle'>): AppLink | null {
  const bundle = plain(app.bundle);
  const name = plain(app.name);
  const found =
    (bundle !== '' ? KNOWN.find((k) => plain(k.bundle) === bundle) : undefined) ??
    (name !== '' ? KNOWN.find((k) => plain(k.name) === name || (k.also ?? []).some((other) => plain(other) === name)) : undefined);
  return found ? { name: found.name, link: found.link } : null;
}

/** Every link in the table (for the checks). */
export const KNOWN_LINKS: readonly AppLink[] = KNOWN.map(({ name, link }) => ({ name, link }));
