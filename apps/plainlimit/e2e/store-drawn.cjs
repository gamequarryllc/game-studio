// The App Store pictures that are drawn rather than photographed from the web
// build (e2e/store-shots.cjs sets each under its caption on a 1320 x 2868 page):
//
// - essentials: the essentials beside a full battery, everything else beside a
//   draining one (the owner's pick of three, 2026-11-19), in the app's Glow look
//   (src/ui/GlowBattery.tsx, the owner's pick for Today, 2026-11-22).
// - ladder: each unlock costs more sums and buys less time (topUpPlan in
//   src/domain/puzzle.ts: 3 sums for 15 minutes, 5 for 10, 7 for 5).
// - secondThought: the screen an app on the Second thought list puts up
//   (askShieldCopy in src/domain/askFirst.ts, the look in src/platform/askFirst.ts).
// - homeScreen: the medium and small widgets on a plain Home Screen
//   (targets/widget/PlainlimitWidget.swift).
//
// Only an iPhone draws the last two, so they are drawn here from the same words
// and colours. App tiles are plain glyphs, so no other company's icon appears,
// and the words state what Plainlimit does, never a comparison with other apps.

const fs = require('fs');
const path = require('path');

const INK = '#F4F5F2';
const INK2 = '#D6D9DC';
const INK3 = '#A9AEB3';
const CARD = '#17191C';
const RAISED = '#24272B';
const ON_TONE = '#10120F';
const GROUND = '#0E1011';
const CORAL = '#FF7B6B';
/** glowForCells in src/domain/tone.ts, by cells left. */
const GLOW = ['#FF4943', '#FFAF00', '#FADC00', '#5CDF81', '#59E783', '#55EE84', '#51F585'];
const SHELL = '#E9ECEA';
const SLOT = 'rgba(255,255,255,0.2)';
const PRO_GOLD = '#F6C744';

const ICON = path.join(__dirname, '..', 'assets', 'images', 'icon.png');

/** Today's battery (GlowBattery.tsx) at a height: a pale casing, cells that shine, used cells as faint slots. */
function glowBattery(lit, h, color = GLOW[lit]) {
  const empty = lit === 0;
  const shell = empty ? color : SHELL;
  const border = Math.max(3, Math.round(h * 0.06));
  const inset = Math.max(3, Math.round(h * 0.095));
  const gap = Math.max(3, Math.round(h * 0.08));
  const radius = Math.round(h * 0.29);
  const cellRadius = Math.max(2, Math.round(h * 0.14));
  const slot = Math.max(1.5, Math.round(h * 0.05) / 2);
  const shine = (size) => `box-shadow:0 0 ${size}px ${color}, 0 0 ${size * 0.4}px ${color}`;
  const cells = Array.from({ length: 6 }, (_, i) =>
    i < lit
      ? `<div style="flex:1;border-radius:${cellRadius}px;background:${color};${shine(h * 0.16)}"></div>`
      : `<div style="flex:1;border-radius:${cellRadius}px;box-shadow:inset 0 0 0 ${slot}px ${SLOT}"></div>`,
  ).join('');
  return `<div style="display:flex;align-items:center;gap:${Math.round(h * 0.06)}px">
      <div style="flex:1;box-sizing:border-box;height:${h}px;border:${border}px solid ${shell};border-radius:${radius}px;padding:${inset}px;display:flex;gap:${gap}px;${empty ? shine(h * 0.2) : ''}">${cells}</div>
      <div style="width:${Math.round(h * 0.09)}px;height:${Math.round(h * 0.38)}px;border-radius:${Math.round(h * 0.045)}px;background:${shell}"></div>
    </div>`;
}

// Plain glyphs on a 24-point grid.
const GLYPHS = {
  call: (c) =>
    `<path fill="${c}" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>`,
  chat: (c) => `<path fill="${c}" d="M5 3.5h14a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-8.5l-5 4v-4H5A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5z"/>`,
  pin: (c) => `<path fill="${c}" fill-rule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.3a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4z"/>`,
  play: (c) => `<path fill="${c}" d="M8 5.3v13.4a1 1 0 0 0 1.5.86l11-6.7a1 1 0 0 0 0-1.72l-11-6.7A1 1 0 0 0 8 5.3z"/>`,
  feed: (c) =>
    `<rect fill="${c}" x="3.5" y="2.5" width="17" height="9" rx="2.2"/><rect fill="${c}" x="3.5" y="13.5" width="17" height="4" rx="1.6"/><rect fill="${c}" opacity=".5" x="3.5" y="19.5" width="17" height="2.5" rx="1.2"/>`,
  game: (c, bg) =>
    `<path fill="${c}" d="M7.2 6.5h9.6a5 5 0 0 1 4.9 4.1l1 5.6a2.6 2.6 0 0 1-4.5 2.2L15.6 16H8.4l-2.6 2.4a2.6 2.6 0 0 1-4.5-2.2l1-5.6a5 5 0 0 1 4.9-4.1z"/><path fill="${bg}" d="M6.6 9.6h1.6v1.6h1.6v1.6H8.2v1.6H6.6v-1.6H5v-1.6h1.6z"/><circle fill="${bg}" cx="16.4" cy="10.6" r="1.1"/><circle fill="${bg}" cx="18.2" cy="12.9" r="1.1"/>`,
  plus: (c) => `<path d="M12 5.5v13M5.5 12h13" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  camera: (c, bg) =>
    `<path fill="${c}" d="M8.5 5.5 9.8 3.8h4.4l1.3 1.7H19a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V8A2.5 2.5 0 0 1 5 5.5z"/><circle cx="12" cy="12.4" r="3.8" fill="${bg}"/><circle cx="12" cy="12.4" r="2.2" fill="${c}"/>`,
  music: (c) => `<path fill="${c}" d="M19.5 3.5v11.6a3 3 0 1 1-2-2.8V7.6l-8 1.7v8.2a3 3 0 1 1-2-2.8V6.1z"/>`,
  mail: (c, bg) => `<rect fill="${c}" x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M4 7l8 6 8-6" stroke="${bg}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  sun: (c) =>
    `<circle fill="${c}" cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  book: (c) => `<path fill="${c}" d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 1 4 18.5zM13 3h5.5A1.5 1.5 0 0 1 20 4.5v14a1.5 1.5 0 0 1-1.5 1.5H13z"/>`,
  clock: (c) => `<circle cx="12" cy="12" r="8.6" stroke="${c}" stroke-width="2.2" fill="none"/><path d="M12 7v5.3l3.4 2" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // Apple's hand.raised symbol, as the web preview draws it (icons.web.tsx, secondThought).
  hand: (c) =>
    `<path stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M8 12.5V5.6a1.4 1.4 0 0 1 2.8 0v5.6M10.8 10.6V4.2a1.4 1.4 0 0 1 2.8 0v6.4M13.6 10.8V5.2a1.4 1.4 0 0 1 2.8 0v7M16.4 12.4V8.4a1.4 1.4 0 0 1 2.8 0v6.2c0 4-2.8 6.8-6.6 6.8h-.8c-2.4 0-3.9-1-5.2-2.8l-2.9-4.2a1.5 1.5 0 0 1 2.3-1.9L8 14.2"/>`,
};

function svg(glyph, size, fg, bg = 'transparent') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="flex:none">${GLYPHS[glyph](fg, bg)}</svg>`;
}

/** A round badge in a tile's corner: a green tick for an essential, a coral minus for an app that counts. */
function badge(free, size, ring) {
  const mark = free
    ? `<path d="M6.8 12.4l3.3 3.3L17.2 8.6" stroke="${ON_TONE}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M7 12h10" stroke="${ON_TONE}" stroke-width="2.8" stroke-linecap="round"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="position:absolute;right:${-size * 0.28}px;top:${-size * 0.28}px;border-radius:50%;box-shadow:0 0 0 ${Math.round(size * 0.12)}px ${ring}"><circle cx="12" cy="12" r="12" fill="${free ? GLOW[6] : CORAL}"/>${mark}</svg>`;
}

/** An app tile: an essential is light, an app that counts is dark. */
function tile(glyph, size, free, ring) {
  const bg = free ? INK : RAISED;
  const fg = free ? ON_TONE : INK3;
  return `<div style="position:relative;flex:none;width:${size}px;height:${size}px;border-radius:${size * 0.235}px;background:${bg};display:flex;align-items:center;justify-content:center">
      ${svg(glyph, size * 0.56, fg, bg)}${badge(free, size * 0.42, ring)}</div>`;
}

const hexA = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

/** One essentials card: three tiles and what they are, then the battery they leave and its word. */
function essentialsCard(top, free, label, glyphs, lit, word) {
  const color = GLOW[lit];
  const ground = '#131618';
  return `<div style="position:absolute;left:90px;right:90px;top:${top}px;padding:64px 64px 60px;border-radius:72px;overflow:hidden;
        background:radial-gradient(700px 420px at 30% 78%, ${hexA(color, 0.2)} 0%, ${hexA(color, 0)} 100%), ${ground};
        box-shadow:inset 0 0 0 3px ${hexA(free ? GLOW[6] : CORAL, 0.45)}">
      <div style="display:flex;align-items:center;gap:40px">
        <div style="display:flex;gap:30px">${glyphs.map((g) => tile(g, 148, free, ground)).join('')}</div>
        <div style="font:700 58px/64px Display, sans-serif;letter-spacing:-1px;color:${INK}">${label}</div>
      </div>
      <div style="margin:72px 0 0 4px;width:950px">${glowBattery(lit, 290, color)}</div>
      <div style="margin-top:48px;font:700 104px/108px Display, sans-serif;letter-spacing:-2.5px;color:${color};text-shadow:0 0 36px ${hexA(color, 0.55)}">${word}</div>
    </div>`;
}

/** Your essentials never count: the picture under the caption, for a page whose caption ends near 400 px. */
function essentialsHtml() {
  return `
    ${essentialsCard(470, true, 'Calls, texts<br>and maps', ['call', 'chat', 'pin'], 6, 'Still full')}
    ${essentialsCard(1360, false, 'Videos, feeds<br>and games', ['play', 'feed', 'game'], 2, 'Draining')}
    <div style="position:absolute;left:0;right:0;top:2350px;text-align:center;font:600 54px/66px Display, sans-serif;color:${INK3}">You pick which apps<br>are your essentials.</div>`;
}

/** Each unlock gets shorter and harder: three rows, more sums each time for a shorter bar of time. */
function ladderHtml() {
  const steps = [
    { nth: '1st unlock', sums: 3, minutes: 15, color: GLOW[6] },
    { nth: '2nd unlock', sums: 5, minutes: 10, color: GLOW[2] },
    { nth: '3rd unlock', sums: 7, minutes: 5, color: GLOW[1] },
  ];
  const rows = steps
    .map(
      (s, i) => `<div style="position:absolute;left:90px;right:90px;top:${490 + i * 350}px;height:320px;box-sizing:border-box;padding:44px 56px 0;border-radius:64px;background:${CARD};box-shadow:inset 0 0 0 2px #25282C">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font:600 42px/46px Display, sans-serif;color:${INK3}">${s.nth} <span style="color:${INK}">· ${s.sums} sums</span></div>
            <div style="display:flex;gap:14px;margin-top:28px">${Array.from({ length: s.sums }, () => `<div style="width:84px;height:84px;border-radius:24px;background:${RAISED};display:flex;align-items:center;justify-content:center">${svg('plus', 50, INK)}</div>`).join('')}</div>
          </div>
          <div style="text-align:right;margin-top:-4px">
            <div style="font:700 112px/112px Display, sans-serif;letter-spacing:-3px;color:${s.color};text-shadow:0 0 34px ${hexA(s.color, 0.5)}">${s.minutes}<span style="font-size:56px;letter-spacing:-1px"> min</span></div>
          </div>
        </div>
        <div style="position:absolute;left:56px;right:56px;bottom:42px;height:22px;border-radius:11px;background:rgba(255,255,255,0.07)">
          <div style="width:${(s.minutes / 15) * 100}%;height:100%;border-radius:11px;background:${s.color};box-shadow:0 0 26px ${s.color}"></div>
        </div>
      </div>`,
    )
    .join('');
  return `${rows}
    <div style="position:absolute;left:0;right:0;top:1555px;text-align:center;font:600 48px/60px Display, sans-serif;color:${INK3}">Then 3 more sums each time,<br>until it recharges.</div>`;
}

/**
 * The screen an app on the Second thought list puts up, at the phone's own 393 x 852 points:
 * the app behind it under a dark blur, a raised hand, the title and line, Not now and Solve one sum.
 */
function secondThoughtScreen() {
  // Something to blur: the top of a feed, in plain shapes.
  const feed = `
    <div style="position:absolute;inset:0;background:#1A1C22">
      <div style="position:absolute;left:16px;top:66px;width:36px;height:36px;border-radius:18px;background:#E9A15B"></div>
      <div style="position:absolute;left:62px;top:72px;width:120px;height:12px;border-radius:6px;background:#8C8F96"></div>
      <div style="position:absolute;left:0;right:0;top:116px;height:400px;background:linear-gradient(160deg,#F2709C 0%,#FF9472 45%,#5B7CFA 100%)"></div>
      <div style="position:absolute;left:60px;top:200px;width:180px;height:180px;border-radius:90px;background:#FFD36E;opacity:.85"></div>
      <div style="position:absolute;left:16px;top:536px;width:260px;height:12px;border-radius:6px;background:#8C8F96"></div>
      <div style="position:absolute;left:16px;top:560px;width:200px;height:12px;border-radius:6px;background:#5E6168"></div>
      <div style="position:absolute;left:0;right:0;top:600px;height:300px;background:linear-gradient(200deg,#3DD6B5 0%,#2B6CF0 100%)"></div>
    </div>`;
  return `
    <div style="position:absolute;inset:0;overflow:hidden">
      <div style="position:absolute;inset:-40px;filter:blur(26px)">${feed}</div>
      <div style="position:absolute;inset:0;background:rgba(21,24,26,0.76)"></div>
      <div style="position:absolute;left:0;right:0;top:250px;display:flex;flex-direction:column;align-items:center;padding:0 40px;text-align:center">
        ${svg('hand', 78, INK)}
        <div style="margin-top:22px;font:700 26px/32px Inter, system-ui, sans-serif;color:${INK}">Second thought</div>
        <div style="margin-top:12px;font:500 17px/23px Inter, system-ui, sans-serif;color:${INK2}">One sum, then your app opens for 10&nbsp;minutes, while your battery has charge.</div>
      </div>
      <div style="position:absolute;left:28px;right:28px;top:672px;height:54px;border-radius:16px;background:${INK};display:flex;align-items:center;justify-content:center;font:600 18px/1 Inter, system-ui, sans-serif;color:${ON_TONE}">Not now</div>
      <div style="position:absolute;left:28px;right:28px;top:742px;height:40px;display:flex;align-items:center;justify-content:center;font:600 18px/1 Inter, system-ui, sans-serif;color:${INK}">Solve one sum</div>
    </div>`;
}

/** The widget's ground (GlowGround): near black, lit in the day's colour from behind the battery. */
function widgetGround(color, x, y, r) {
  return `background:radial-gradient(${r}px ${r}px at ${x} ${y}, ${hexA(color, 0.3)} 0%, ${hexA(color, 0)} 100%), linear-gradient(#151B18, #090C0B);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)`;
}

/** The medium and small widgets with five cells left, on a plain Home Screen, at 393 x 852 points. */
function homeScreen() {
  const color = GLOW[5];
  const word = (size) => `font:700 ${size}px/${size * 1.08}px Display, sans-serif;letter-spacing:-0.4px;color:${color};text-shadow:0 0 9px ${hexA(color, 0.45)}`;
  const recharge = (size) => `font:600 ${size}px/1.2 Inter, system-ui, sans-serif;letter-spacing:-0.2px;white-space:nowrap;color:rgba(244,245,242,0.62)`;
  const label = (text) => `<div style="margin-top:6px;text-align:center;font:500 12px/1 Inter, system-ui, sans-serif;color:${INK}">${text}</div>`;
  const icon = fs.readFileSync(ICON).toString('base64');
  const app = (glyph, bg, fg = '#FFFFFF') =>
    `<div><div style="width:64px;height:64px;border-radius:15px;background:${bg};display:flex;align-items:center;justify-content:center">${svg(glyph, 34, fg, bg)}</div></div>`;
  const tones = ['#2E3A47', '#3A3346', '#2F4038', '#463A2E', '#2E4246', '#41303A', '#33384A', '#3D4230', '#3B3A2E', '#2E3F44', '#3F2F3F', '#2F3A30'];
  const glyphs = ['camera', 'music', 'mail', 'sun', 'game', 'clock', 'feed', 'play'];
  return `
    <div style="position:absolute;inset:0;background:radial-gradient(420px 380px at 20% 30%, #1F3B2C 0%, rgba(0,0,0,0) 100%), radial-gradient(420px 420px at 90% 85%, #23304A 0%, rgba(0,0,0,0) 100%), linear-gradient(#141A18, #0B0D0E)"></div>
    <div style="position:absolute;left:24px;right:24px;top:72px">
      <div style="height:164px;border-radius:24px;box-sizing:border-box;padding:0 20px;display:flex;align-items:center;gap:18px;${widgetGround(color, '30%', '50%', 260)}">
        <div style="width:168px">${glowBattery(5, 74, color)}</div>
        <div style="width:122px">
          <div style="${word(26)}">Plenty<br>left</div>
          <div style="${recharge(13)};margin-top:6px">Recharges 6:00 AM</div>
        </div>
      </div>
      ${label('Plainlimit')}
    </div>
    <div style="position:absolute;left:24px;top:282px;width:164px">
      <div style="height:164px;border-radius:24px;box-sizing:border-box;padding:18px;display:flex;flex-direction:column;${widgetGround(color, '50%', '28%', 180)}">
        <div>${glowBattery(5, 50, color)}</div>
        <div style="flex:1"></div>
        <div style="${word(22)}">Plenty left</div>
        <div style="${recharge(12)};margin-top:4px">Recharges 6:00 AM</div>
      </div>
      ${label('Plainlimit')}
    </div>
    <div style="position:absolute;left:213px;top:282px;width:156px;display:grid;grid-template-columns:64px 64px;gap:28px;justify-content:space-between">${glyphs
      .slice(0, 4)
      .map((g, i) => app(g, tones[i]))
      .join('')}</div>
    <div style="position:absolute;left:24px;right:24px;top:494px;display:flex;justify-content:space-between">${glyphs
      .slice(4, 8)
      .map((g, i) => app(g, tones[i + 4]))
      .join('')}</div>
    <div style="position:absolute;left:24px;right:24px;top:590px;display:flex;justify-content:space-between">${['sun', 'mail', 'clock', 'game']
      .map((g, i) => app(g, tones[i + 8]))
      .join('')}</div>
    <div style="position:absolute;left:12px;right:12px;bottom:22px;height:92px;border-radius:34px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-around;padding:0 6px">
      <img src="data:image/png;base64,${icon}" style="width:64px;height:64px;border-radius:15px">
      ${app('call', '#2C3D33')}${app('chat', '#2C3546')}${app('pin', '#40372C')}
    </div>`;
}

module.exports = { essentialsHtml, ladderHtml, secondThoughtScreen, homeScreen, GLOW, PRO_GOLD, GROUND, INK, INK3, hexA };
