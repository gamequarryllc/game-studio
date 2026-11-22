// Makes the App Store screenshots: opens the web build with a believable day and
// week written straight into its storage, stands in for a phone that is counting
// ("?mock=counting,store": no test tools, no box for the list only a phone can
// draw), photographs five screens and sets each under a short caption on a
// 1320 x 2868 page (the 6.9-inch iPhone size App Store Connect asks for), inside a
// plain phone outline with a status bar. The first picture is drawn instead
// (e2e/store-essentials.cjs): the essentials beside a full battery, everything
// else beside a draining one.
//
//   APP_BASE_URL=/game-studio/apps/plainlimit EXPO_OFFLINE=1 npx expo export --platform web
//   node e2e/store-shots.cjs [out folder]      (default: store/plainlimit/screenshots)
//
// The pictures come from the web build, which draws the same screens from the same
// code. What only an iPhone draws (Apple's list of apps, the screens over a locked
// app, the widget) is not in them.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');
const { essentialsHtml } = require('./store-essentials.cjs');

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
// it is for instead (the owner's pick, 2026-11-19). `raw` names the photographed screen; `drawn` replaces the phone.
const SHOTS = [
  { file: '01-essentials', drawn: essentialsHtml, caption: 'Your essentials\nare free.' },
  { file: '02-today', raw: 'today', caption: 'One battery a day\nfor everything else.' },
  { file: '03-empty', raw: 'empty', caption: 'When it runs out,\nthe scroll locks.' },
  { file: '04-sums', raw: 'sums', caption: 'Need a little more?\nEarn it with sums.' },
  { file: '05-settings', raw: 'settings', caption: 'Recharges at 6 AM,\nnot midnight.' },
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

/** Six finished days before today: mostly under a 3 h 30 min goal, one over with earned time. */
function week() {
  const today = periodStart(360);
  const days = [
    [165, 0],
    [192, 0],
    [236, 1],
    [148, 0],
    [201, 0],
    [174, 0],
  ];
  return days.map(([used, topUps], i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (6 - i));
    return { start: start.toISOString(), goalMinutes: GOAL, usedMinutes: used, topUps, state: 'counted' };
  });
}

function doc(used, emptyLevel = 'work') {
  const topUps = 0;
  return {
    v: 1,
    settings: { goalMinutes: GOAL, rechargeMinute: 360, countMode: 'custom', emptyLevel, allowed: [] },
    day: { periodStart: periodStart(360).toISOString(), usedMinutes: used, topUps, unlockedUntil: null, uncounted: false },
    watching: true,
    setupDone: true,
    history: week(),
  };
}

/** A plain phone: dark edge, rounded corners, a camera cut-out, a status bar and the bar at the foot. */
function phoneHtml(img) {
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
        <img src="data:image/png;base64,${img}" style="position:absolute;left:0;top:${px(STATUS)};width:${px(APP.width)};height:${px(APP.height)}">
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

    // 3: Settings, with the default "Work for it".
    {
      const { page, context } = await open(doc(95));
      await tab(page, 'Settings');
      await page.getByText('Daily goal', { exact: true }).first().waitFor();
      await raw(page, 'settings');
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

    // Each picture under its caption, on the app's own dark ground.
    const font = fs.readFileSync(FONT).toString('base64');
    const semi = fs.readFileSync(FONT_SEMI).toString('base64');
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const picture = shot.drawn ? shot.drawn() : phoneHtml(fs.readFileSync(path.join(RAW, `${shot.raw}.png`)).toString('base64'));
      const lines = shot.caption.split('\n').map((l) => `<div>${l}</div>`).join('');
      await sheet.setContent(`<!doctype html><html><head><style>
        @font-face { font-family: Display; font-weight: 700; src: url(data:font/ttf;base64,${font}); }
        @font-face { font-family: Display; font-weight: 600; src: url(data:font/ttf;base64,${semi}); }
        html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; overflow: hidden;
                     background: radial-gradient(1200px 900px at 50% 1500px, #16231A 0%, ${GROUND} 70%); }
        .caption { position: absolute; top: 170px; left: 0; right: 0; text-align: center; font: 700 96px/108px Display, sans-serif; letter-spacing: -2px; color: #F4F5F2; }
        .phone { position: absolute; top: 450px; left: 50%; transform: translateX(-50%); box-sizing: content-box; border: 22px solid #050606; border-radius: 156px;
                 box-shadow: 0 0 0 4px #3A3E43, 0 0 0 6px #1B1D20, 0 60px 140px rgba(0, 0, 0, 0.55); background: #050606; }
        .btn { position: absolute; width: 9px; border-radius: 4px; background: #34383D; }
        .screen { position: absolute; inset: 0; overflow: hidden; }
      </style></head><body><div class="caption">${lines}</div>${picture}</body></html>`);
      await sheet.evaluate(() => document.fonts.ready);
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
