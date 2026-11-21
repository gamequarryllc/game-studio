// The first App Store picture: what the essentials are, at a glance. Two cards,
// one above the other: calls, texts and maps beside a full green battery ("Still
// full"), and videos, feeds and games beside a yellow one with two cells left
// ("Draining"). The owner picked this from three mock-ups (2026-11-19) because it
// reads without reading, even at the size search results show.
//
// It is drawn here rather than photographed from the app: the app has no screen
// that puts the two side by side. The battery is the app's own drawing
// (src/ui/Battery.tsx) at its own colours (src/domain/tone.ts), and the app
// tiles are plain glyphs, so no other company's icon appears. The words state
// what Plainlimit does, never a comparison with other apps.

const INK = "#F4F5F2";
const INK3 = "#A9AEB3";
const CARD = "#17191C";
const RAISED = "#24272B";
const ON_TONE = "#10120F";
const GREEN = "#4AC66F";
const CORAL = "#FF7B6B";
/** The battery's colours for six cells and for two (toneForCells(6) and toneForCells(2)). */
const FULL = "#46CC70";
const TWO_LEFT = "#E5CC1C";
const TRACK = "rgba(16,18,15,0.32)";

/** The app's battery at a height: a casing with a hard shadow, six cells, and the cap. A used cell is an outlined slot. */
function battery(lit, h, bg) {
  const border = Math.round(h * 0.07);
  const inset = Math.round(h * 0.085);
  const radius = Math.round(h * 0.27);
  const cellRadius = Math.round(h * 0.12);
  const slot = Math.max(2, Math.round(h * 0.035));
  const drop = Math.round(h * 0.085);
  const capWidth = Math.round(h * 0.11);
  const capGap = Math.round(h * 0.06);
  const cells = Array.from({ length: 6 }, (_, i) =>
    i < lit
      ? `<div style="flex:1;position:relative;border-radius:${cellRadius}px;background:${ON_TONE}"><div style="position:absolute;left:22%;right:22%;top:${Math.round(h * 0.06)}px;height:${Math.round(h * 0.05)}px;border-radius:9px;background:rgba(255,255,255,0.18)"></div></div>`
      : `<div style="flex:1;border-radius:${cellRadius}px;box-shadow:inset 0 0 0 ${slot}px ${TRACK}"></div>`,
  ).join("");
  return `<div style="display:flex;align-items:center;gap:${capGap}px;padding-bottom:${drop}px">
      <div style="flex:1;position:relative;height:${h}px">
        <div style="position:absolute;left:0;right:0;top:${drop}px;height:${h}px;border-radius:${radius}px;background:${TRACK}"></div>
        <div style="position:relative;box-sizing:border-box;height:${h}px;border:${border}px solid ${ON_TONE};border-radius:${radius}px;background:${bg};padding:${inset}px;display:flex;gap:${inset}px">${cells}</div>
      </div>
      <div style="width:${capWidth}px;height:${Math.round(h * 0.4)}px;border-radius:0 ${capWidth}px ${capWidth}px 0;background:${ON_TONE};margin-bottom:${drop}px"></div>
    </div>`;
}

// Plain glyphs on a 24-point grid: a handset, a speech bubble and a map pin; a video, a feed and a game pad.
const GLYPHS = {
  call: (c) =>
    `<path fill="${c}" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>`,
  chat: (c) =>
    `<path fill="${c}" d="M5 3.5h14a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-8.5l-5 4v-4H5A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5z"/>`,
  pin: (c) =>
    `<path fill="${c}" fill-rule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.3a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4z"/>`,
  play: (c) =>
    `<path fill="${c}" d="M8 5.3v13.4a1 1 0 0 0 1.5.86l11-6.7a1 1 0 0 0 0-1.72l-11-6.7A1 1 0 0 0 8 5.3z"/>`,
  feed: (c) =>
    `<rect fill="${c}" x="3.5" y="2.5" width="17" height="9" rx="2.2"/><rect fill="${c}" x="3.5" y="13.5" width="17" height="4" rx="1.6"/><rect fill="${c}" opacity=".5" x="3.5" y="19.5" width="17" height="2.5" rx="1.2"/>`,
  game: (c, bg) =>
    `<path fill="${c}" d="M7.2 6.5h9.6a5 5 0 0 1 4.9 4.1l1 5.6a2.6 2.6 0 0 1-4.5 2.2L15.6 16H8.4l-2.6 2.4a2.6 2.6 0 0 1-4.5-2.2l1-5.6a5 5 0 0 1 4.9-4.1z"/><path fill="${bg}" d="M6.6 9.6h1.6v1.6h1.6v1.6H8.2v1.6H6.6v-1.6H5v-1.6h1.6z"/><circle fill="${bg}" cx="16.4" cy="10.6" r="1.1"/><circle fill="${bg}" cx="18.2" cy="12.9" r="1.1"/>`,
};

/** A round badge in a tile's corner: a green tick for an essential, a coral minus for an app that counts. */
function badge(free, size) {
  const mark = free
    ? `<path d="M6.8 12.4l3.3 3.3L17.2 8.6" stroke="${ON_TONE}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M7 12h10" stroke="${ON_TONE}" stroke-width="2.8" stroke-linecap="round"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="position:absolute;right:${-size * 0.28}px;top:${-size * 0.28}px;border-radius:50%;box-shadow:0 0 0 ${Math.round(size * 0.12)}px ${CARD}"><circle cx="12" cy="12" r="12" fill="${free ? GREEN : CORAL}"/>${mark}</svg>`;
}

/** An app tile: an essential is light, an app that counts is dark. */
function tile(glyph, size, free) {
  const bg = free ? INK : RAISED;
  const fg = free ? ON_TONE : INK3;
  return `<div style="position:relative;flex:none;width:${size}px;height:${size}px;border-radius:${size * 0.235}px;background:${bg};display:flex;align-items:center;justify-content:center">
      <svg width="${size * 0.56}" height="${size * 0.56}" viewBox="0 0 24 24">${GLYPHS[glyph](fg, bg)}</svg>${badge(free, size * 0.42)}</div>`;
}

/** One card: three tiles and what they are, then the battery they leave. */
function card(top, free, label, glyphs, lit, result) {
  const tone = lit === 6 ? FULL : TWO_LEFT;
  return `<div style="position:absolute;left:80px;right:80px;top:${top}px;padding:68px 64px 64px;border-radius:72px;background:${CARD};box-shadow:inset 0 0 0 3px ${free ? "rgba(74,198,111,0.55)" : "rgba(255,123,107,0.55)"}">
      <div style="display:flex;align-items:center;gap:36px">
        <div style="display:flex;gap:28px">${glyphs.map((g) => tile(g, 150, free)).join("")}</div>
        <div style="font:700 60px/66px Display, sans-serif;letter-spacing:-1px;color:${INK}">${label}</div>
      </div>
      <div style="margin-top:56px;padding:52px 56px 40px;border-radius:56px;background:${tone}">
        ${battery(lit, 250, tone)}
        <div style="margin-top:22px;font:700 84px/92px Display, sans-serif;letter-spacing:-1.5px;color:${ON_TONE}">${result}</div>
      </div>
    </div>`;
}

/** The picture under the caption, for a 1320 x 2868 page whose caption ends near 400 px. */
function essentialsHtml() {
  return `
    ${card(540, true, "Calls, texts<br>and maps", ["call", "chat", "pin"], 6, "Still full")}
    ${card(1460, false, "Videos, feeds<br>and games", ["play", "feed", "game"], 2, "Draining")}
    <div style="position:absolute;left:0;right:0;top:2420px;text-align:center;font:600 54px/64px Display, sans-serif;color:${INK3}">You pick which apps<br>are your essentials.</div>`;
}

module.exports = { essentialsHtml };
