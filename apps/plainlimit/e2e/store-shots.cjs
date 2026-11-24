// Makes the App Store screenshots: opens the web build with a believable day,
// week and record written straight into its storage, stands in for a phone that
// is counting ("?mock=counting,store": no test tools, no box for the list only a
// phone can draw), photographs its screens and sets each under a short caption
// on a 1320 x 2868 page (the 6.9-inch iPhone size App Store Connect asks for),
// inside a plain phone outline with a status bar, on the dark ground lit in the
// colour the picture is about. Some pictures are drawn instead (e2e/store-drawn.cjs):
// the essentials beside two batteries, the rising cost of each unlock, the Second
// thought screen and the widgets, which only an iPhone draws.
//
//   APP_BASE_URL=/game-studio/apps/plainlimit EXPO_OFFLINE=1 npx expo export --platform web
//   node e2e/store-shots.cjs [out folder]      (default: store/plainlimit/screenshots)
//
// The photographed pictures come from the web build, which draws the same screens
// from the same code.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');
const { essentialsHtml, ladderHtml, secondThoughtScreen, homeScreen, GLOW, PRO_GOLD, hexA } = require('./store-drawn.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'store', 'plainlimit', 'screenshots'));
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'plainlimit-store-'));
const PAGE = { width: 1320, height: 2868 };
const FONTS = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'space-grotesk');
const FONT = path.join(FONTS, '700Bold', 'SpaceGrotesk_700Bold.ttf');
const FONT_SEMI = path.join(FONTS, '600SemiBold', 'SpaceGrotesk_600SemiBold.ttf');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const KEY = 'plainlimit.doc.v1';

// A 393 x 852 point phone screen: 54 points of status bar, then the app.
const STATUS = 54;
const SCREEN = { width: 393, height: 852 };
const APP = { width: SCREEN.width, height: SCREEN.height - STATUS };
const GROUND = '#0E1011';

// Search results show the first three. The Essentials screen itself is left out: its steps name other companies'
// apps and read like a manual at this size (the fresh-eyes review, 2026-11-16); the drawn first picture says what
// it is for instead (the owner's pick, 2026-11-19). Each picture is one of: `raw` (a photographed screen in the
// phone), `screen` (a drawn screen in the phone), `drawn` (a drawn picture in place of the phone), or `drawn` with
// `raw` and `phoneTop` (the picture above, the top of the phone below it). `*words*` in a caption are lit in `glow`.
// `pro` marks a Pro feature, as App Review asks (guideline 2.3.2). The captions state what Plainlimit does, never a
// comparison with other apps. The last one is the owner's own story (2026-11-22).
const SHOTS = [
  { file: '01-essentials', drawn: essentialsHtml, glow: GLOW[6], caption: 'Your essentials\n*never count.*' },
  { file: '02-today', raw: 'today', glow: GLOW[5], caption: 'One battery a day\nfor *everything else.*' },
  { file: '03-unlocks', drawn: ladderHtml, raw: 'sums', phoneTop: 1760, glow: GLOW[1], caption: 'Each unlock gets\n*shorter and harder.*' },
  { file: '04-empty', raw: 'empty', glow: GLOW[0], caption: 'When it runs out,\n*the scroll locks.*' },
  { file: '05-second-thought', screen: secondThoughtScreen, glow: '#A27BFF', pro: true, caption: 'A *second thought*\nbefore you scroll.' },
  { file: '06-widget', screen: homeScreen, glow: GLOW[5], caption: 'Your battery on\nyour *Home Screen.*' },
  { file: '07-history', raw: 'record', glow: GLOW[6], caption: 'Made by a phone addict,\n*for phone addicts.*', sub: 'No account. No ads. No subscription.' },
];

// The clock the pictures are taken at: 9:41 AM today, as in the status bar, so the countdown to the recharge agrees.
const NOW = (() => {
  const d = new Date();
  d.setHours(9, 41, 0, 0);
  return d;
})();

const GOAL = 210;

/** The current battery's start for a recharge minute, as the app works it out. */
function periodStart(rechargeMinute, now = NOW) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(rechargeMinute / 60), rechargeMinute % 60);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

/** Finished days before today, newest last: mostly under a 3 h 30 min goal, now and then over with earned time. */
function history(days = 84) {
  const today = periodStart(360);
  // The last six are the week Today shows.
  const pattern = [183, 158, 199, 171, 140, 205, 188, 162, 151, 176, 165, 192, 236, 148, 201, 174];
  return Array.from({ length: days }, (_, k) => {
    const back = days - k;
    const used = back <= 6 ? pattern[pattern.length - back] : pattern[back % 10] + (back % 23 === 0 ? 40 : 0);
    const start = new Date(today);
    start.setDate(start.getDate() - back);
    return { start: start.toISOString(), goalMinutes: GOAL, usedMinutes: used, topUps: used > GOAL ? 1 : 0, state: 'counted' };
  });
}

/** Monday of the week, as the record keeps it (weekKey in src/domain/record.ts). */
function mondayKey(d) {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/** Twelve weeks of record: one emergency pass used 23 days ago, two saved. */
function record() {
  const since = periodStart(360);
  since.setDate(since.getDate() - 84);
  const used = periodStart(360);
  used.setDate(used.getDate() - 23);
  used.setHours(22, 10);
  return { passes: 2, lastAdded: mondayKey(NOW), since: since.toISOString(), uses: [used.toISOString()], passUntil: null };
}

function doc(used, emptyLevel = 'work') {
  const topUps = 0;
  return {
    v: 1,
    settings: { goalMinutes: GOAL, rechargeMinute: 360, countMode: 'custom', emptyLevel, allowed: [] },
    day: { periodStart: periodStart(360).toISOString(), usedMinutes: used, topUps, unlockedUntil: null, uncounted: false },
    watching: true,
    setupDone: true,
    history: history(),
    record: record(),
  };
}

/** A plain phone: dark edge, rounded corners, a camera cut-out, a status bar and the bar at the foot. */
function phoneHtml({ img, screen }) {
  const scale = 2.672; // points to pixels on the page
  const px = (n) => `${(n * scale).toFixed(1)}px`;
  const ink = '#F4F5F2';
  return `
    <div class="phone" style="width:${px(SCREEN.width)};height:${px(SCREEN.height)}">
      <div class="btn" style="left:-31px;top:${px(170)};height:${px(32)}"></div>
      <div class="btn" style="left:-31px;top:${px(232)};height:${px(60)}"></div>
      <div class="btn" style="left:-31px;top:${px(306)};height:${px(60)}"></div>
      <div class="btn" style="right:-31px;top:${px(262)};height:${px(96)}"></div>
      <div class="screen" style="border-radius:${px(50)};background:${GROUND}">
        ${img ? `<img src="data:image/png;base64,${img}" style="position:absolute;left:0;top:${px(STATUS)};width:${px(APP.width)};height:${px(APP.height)}">` : ''}
        ${screen ? `<div style="position:absolute;left:0;top:0;width:${SCREEN.width}px;height:${SCREEN.height}px;transform:scale(${scale});transform-origin:0 0">${screen}</div>` : ''}
        <div style="position:absolute;left:${px(40)};top:${px(18)};font:600 ${px(16.5)}/${px(22)} system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;color:${ink}">9:41</div>
        <div style="position:absolute;left:50%;top:${px(11)};width:${px(122)};height:${px(35)};margin-left:${px(-61)};border-radius:${px(20)};background:#000"></div>
        <svg style="position:absolute;right:${px(30)};top:${px(21)}" width="${px(78)}" height="${px(14)}" viewBox="0 0 78 14" fill="${ink}">
          <rect x="0" y="9" width="3.2" height="4" rx="1"/><rect x="5" y="6.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3.5" width="3.2" height="9.5" rx="1"/><rect x="15" y="0.5" width="3.2" height="12.5" rx="1"/>
          <path d="M33.5 3.1c2.6 0 5 1 6.8 2.7l-1.3 1.4a8 8 0 0 0-11 0l-1.3-1.4a9.900 9.900 0 0 1 6.800-2.700zm0 3.700c1.600 0 3.100.6 4.200 1.700l-1.300 1.400a4.200 4.200 0 0 0-5.800 0l-1.300-1.400a6.100 6.100 0 0 1 4.200-1.700zm0 3.600c.7 0 1.300.3 1.800.7l-1.800 1.900-1.800-1.900c.5-.400 1.100-.700 1.800-.700z"/>
          <rect x="48.500" y="1" width="24" height="12" rx="3.600" fill="none" stroke="${ink}" stroke-opacity="0.400" stroke-width="1"/><rect x="50.200" y="2.700" width="20.600" height="8.600" rx="2.200"/><rect x="74" y="4.800" width="1.600" height="4.400" rx="0.800" fill-opacity="0.450"/>
        </svg>
        <div style="position:absolute;left:50%;bottom:${px(8)};width:${px(138)};height:${px(5)};margin-left:${px(-69)};border-radius:${px(3)};background:${ink}"></div>
      </div>
    </div>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  const errors = [];
  try {
    /** Opens the app with `saved` in storage, standing in for a counting phone. */
    async function open(saved) {
      const context = await browser.newContext({ viewport: APP, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'dark', locale: 'en-US' });
      await context.clock.install({ time: NOW });
      await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [KEY, JSON.stringify(saved)]);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(url + '?mock=counting,store');
      await page.getByText('Today', { exact: true }).first().waitFor();
      await page.waitForTimeout(800);
      return { page, context };
    }
    const raw = async (page, name) => {
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(RAW, `${name}.png`) });
    };
    const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();

    // 1: an ordinary morning, 47 minutes into a 3 h 30 min day.
    {
      const { page, context } = await open(doc(47));
      await page.getByText('Plenty left').first().waitFor();
      await raw(page, 'today');
      await context.close();
    }

    // 2: the battery empty, with "Work for it" (as Settings shows next), so the
    // screen leads on to the sums.
    {
      const { page, context } = await open(doc(GOAL));
      await page.getByRole('button', { name: /Solve 3 sums/ }).first().waitFor();
      await raw(page, 'empty');
      await context.close();
    }

    // 3: History: 23 days without an emergency pass, and twelve weeks day by day.
    {
      const { page, context } = await open(doc(47));
      await page.getByRole('button', { name: /^History/ }).first().click();
      await page.getByText('days without an emergency pass', { exact: false }).first().waitFor();
      await raw(page, 'record');
      await context.close();
    }

    // For App Review, not the listing: the screen where Plainlimit Pro is bought.
    {
      const { page, context } = await open(doc(47));
      await tab(page, 'Settings');
      await page.getByRole('button', { name: /^Plainlimit Pro/ }).click();
      await page.getByText('Restore purchase', { exact: true }).first().waitFor();
      await raw(page, 'pro-screen');
      await context.close();
    }

    // 4: "Work for it" when empty: the sums, with the first answer being typed.
    {
      const { page, context } = await open(doc(GOAL));
      await page.getByRole('button', { name: /Solve 3 sums/ }).click();
      await page.getByText('Sum 1 of 3', { exact: false }).first().waitFor();
      const sum = await page.getByText(/^\s*\d+\s*[+−-]\s*\d+\s*$/).first().textContent();
      const [, a, op, b] = sum.match(/(\d+)\s*([+−-])\s*(\d+)/);
      // All but the last digit: the whole answer would move on to the next sum by itself.
      await page.getByRole('textbox').first().fill(String(op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)).slice(0, -1));
      await raw(page, 'sums');
      await context.close();
    }

    if (errors.length > 0) throw new Error('page errors: ' + errors.join('; '));

    // Each picture under its caption, on the app's own dark ground lit in the picture's colour.
    const font = fs.readFileSync(FONT).toString('base64');
    const semi = fs.readFileSync(FONT_SEMI).toString('base64');
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const img = shot.raw ? fs.readFileSync(path.join(RAW, `${shot.raw}.png`)).toString('base64') : null;
      let picture;
      let phoneTop = shot.sub ? 520 : 450;
      if (shot.drawn) {
        picture = shot.drawn();
        if (img) {
          picture += phoneHtml({ img });
          phoneTop = shot.phoneTop;
        }
      } else {
        picture = phoneHtml({ img, screen: shot.screen ? shot.screen() : null });
      }
      const lit = (line) => line.replace(/\*([^*]+)\*/g, `<span style="color:${shot.glow};text-shadow:0 0 40px ${hexA(shot.glow, 0.45)}">$1</span>`);
      const lines = shot.caption.split('\n').map((l) => `<div class="line">${lit(l)}</div>`).join('');
      const pro = shot.pro ? `<div class="pro">PRO</div>` : '';
      const sub = shot.sub ? `<div class="sub">${shot.sub}</div>` : '';
      await sheet.setContent(`<!doctype html><html><head><style>
        @font-face { font-family: Display; font-weight: 700; src: url(data:font/ttf;base64,${font}); }
        @font-face { font-family: Display; font-weight: 600; src: url(data:font/ttf;base64,${semi}); }
        html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; overflow: hidden;
                     background: radial-gradient(1300px 1100px at 50% 1500px, ${hexA(shot.glow, 0.13)} 0%, ${hexA(shot.glow, 0)} 70%), ${GROUND}; }
        .top { position: absolute; top: ${shot.pro ? 120 : 170}px; left: 60px; right: 60px; text-align: center; }
        .caption { font: 700 96px/108px Display, sans-serif; letter-spacing: -2px; color: #F4F5F2; }
        .line { white-space: nowrap; }
        .pro { display: inline-block; margin-bottom: 26px; padding: 8px 22px; border-radius: 14px; background: ${PRO_GOLD}; color: #10120F; font: 700 40px/48px Display, sans-serif; letter-spacing: 1px; }
        .sub { margin-top: 26px; font: 600 46px/56px Display, sans-serif; color: #A9AEB3; }
        .phone { position: absolute; top: ${phoneTop}px; left: 50%; transform: translateX(-50%); box-sizing: content-box; border: 22px solid #050606; border-radius: 156px;
                 box-shadow: 0 0 0 4px #3A3E43, 0 0 0 6px #1B1D20, 0 60px 140px rgba(0, 0, 0, 0.55); background: #050606; }
        .btn { position: absolute; width: 9px; border-radius: 4px; background: #34383D; }
        .screen { position: absolute; inset: 0; overflow: hidden; }
      </style></head><body><div class="top">${pro}<div class="caption">${lines}</div>${sub}</div>${picture}</body></html>`);
      await sheet.evaluate(() => document.fonts.ready);
      // A caption line too wide for the page is set smaller, never cut.
      await sheet.evaluate(() => {
        const caption = document.querySelector('.caption');
        const room = document.querySelector('.top').clientWidth;
        let size = 96;
        while (size > 60 && [...caption.querySelectorAll('.line')].some((l) => l.scrollWidth > room)) {
          size -= 2;
          caption.style.fontSize = `${size}px`;
          caption.style.lineHeight = `${Math.round(size * 1.125)}px`;
        }
      });
      await sheet.waitForTimeout(250);
      await sheet.screenshot({ path: path.join(OUT, `${shot.file}.png`), omitBackground: false });
    }
    for (const stale of fs.readdirSync(OUT)) {
      if (/^\d\d-.*\.png$/.test(stale) && !SHOTS.some((s) => `${s.file}.png` === stale)) fs.unlinkSync(path.join(OUT, stale));
    }
    // The Pro screen for App Review, at the store's own picture size (App Store
    // Connect turns down the bare 1179 x 2394 screen): scaled to fit, on the app's ground.
    {
      const img = fs.readFileSync(path.join(RAW, 'pro-screen.png')).toString('base64');
      await sheet.setContent(`<!doctype html><html><body style="margin:0;width:${PAGE.width}px;height:${PAGE.height}px;overflow:hidden;background:${GROUND}">
        <img src="data:image/png;base64,${img}" style="width:100%;height:100%;object-fit:contain"></body></html>`);
      await sheet.waitForTimeout(250);
      await sheet.screenshot({ path: path.join(OUT, 'iap-review-pro-screen.png') });
    }
    console.log(`Store screenshots: ${OUT}\nRaw screens: ${RAW}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
