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
 * a name is given is the covering screen's own extension, which is told the
 * app it is drawing over. It notes that app (name and bundle id, replacing
 * the one before) in the settings the app shares with its extensions. The
 * note never leaves the phone, and it is only believed for a few minutes: the
 * sum follows the covering screen within moments.
 *
 * Its link: there is no directory of these, so the table below holds the
 * well-known ones. An app that is not in it, or a link that no longer works,
 * falls back to saying "go back to the one you wanted".
 */

/** What the covering screen's extension noted (plugins/withTargets.js writes the Swift). */
export interface Covered {
  name: string;
  bundle: string;
  /** When it was noted, in milliseconds. */
  at: number;
}

/** How long the note is believed. */
export const COVERED_FRESH_MS = 10 * 60_000;

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

/** The note, if it is one and still fresh. Anything else (nothing noted, an old note, a website) is no app. */
export function asCovered(saved: unknown, now: number): Covered | null {
  if (!saved || typeof saved !== 'object') return null;
  const { name, bundle, at } = saved as Record<string, unknown>;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  // A minute's grace for a clock that stepped back; nothing from the future beyond that.
  if (now - at > COVERED_FRESH_MS || at - now > 60_000) return null;
  const app = { name: typeof name === 'string' ? name.trim() : '', bundle: typeof bundle === 'string' ? bundle.trim() : '', at };
  return app.name === '' && app.bundle === '' ? null : app;
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
