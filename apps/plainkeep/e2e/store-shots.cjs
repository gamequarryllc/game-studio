// Makes the App Store screenshots: loads the sample household in a headless browser,
// photographs four screens and the service record, and sets each under a short caption
// on a 1320 x 2868 page (the 6.9-inch iPhone size App Store Connect asks for). The four
// screens sit inside a plain phone outline with a status bar; the record is shown as the
// sheet of paper it becomes. Also saves the Pro screen by itself, which the in-app
// purchase needs for review.
//
//   APP_BASE_URL=/game-studio/apps/plainkeep npx expo export --platform web
//   node e2e/store-shots.cjs [out folder]      (default: store/plainkeep/screenshots)
//
// The pictures come from the web build, which draws the same screens with the same
// code; the iPhone's own tab bar, symbols and alerts differ slightly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');
const { helpers, newPhone, start, problems } = require('./run.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'store', 'plainkeep', 'screenshots'));
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'plainkeep-store-'));
const PAGE = { width: 1320, height: 2868 };
const FONT = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'barlow-condensed', '600SemiBold', 'BarlowCondensed_600SemiBold.ttf');

// A 393 x 852 point phone screen: 54 points of status bar, then the app.
const STATUS = 54;
const SCREEN = { width: 393, height: 852 };
const APP = { width: SCREEN.width, height: SCREEN.height - STATUS };
const WALL = '#ECEEEC';
const INK = '#16191C';
// The record is laid out narrower than the printed page so the words are large enough to read at App Store size.
const RECORD_W = 500;

const SHOTS = [
  { file: '01-due', kind: 'phone', caption: 'Know what’s due on\nthe house and the car.' },
  { file: '02-job', kind: 'phone', caption: 'Mark it done. The next\ndate sets itself.' },
  { file: '03-car', kind: 'phone', caption: 'By the calendar, by the\nodometer, or both.' },
  { file: '04-log', kind: 'phone', caption: 'Everything you’ve done,\nand what it cost.' },
  { file: '05-record', kind: 'sheet', caption: 'A service record for a\nbuyer or a landlord.' },
];

/** A plain phone: dark edge, rounded corners, a camera cut-out, a status bar and the bar at the foot. */
function phoneHtml(img, top) {
  const scale = 2.672; // points to pixels on the page
  const px = (n) => `${(n * scale).toFixed(1)}px`;
  return `
    <div class="phone" style="width:${px(SCREEN.width)};height:${px(SCREEN.height)}">
      <div class="btn" style="left:-31px;top:${px(170)};height:${px(32)}"></div>
      <div class="btn" style="left:-31px;top:${px(232)};height:${px(60)}"></div>
      <div class="btn" style="left:-31px;top:${px(306)};height:${px(60)}"></div>
      <div class="btn" style="right:-31px;top:${px(262)};height:${px(96)}"></div>
      <div class="screen" style="border-radius:${px(50)};background:${top}">
        <img src="data:image/png;base64,${img}" style="position:absolute;left:0;top:${px(STATUS)};width:${px(APP.width)};height:${px(APP.height)}">
        <div style="position:absolute;left:${px(40)};top:${px(18)};font:600 ${px(16.5)}/${px(22)} system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;color:${INK}">9:41</div>
        <div style="position:absolute;left:50%;top:${px(11)};width:${px(122)};height:${px(35)};margin-left:${px(-61)};border-radius:${px(20)};background:#0B0B0C"></div>
        <svg style="position:absolute;right:${px(30)};top:${px(21)}" width="${px(78)}" height="${px(14)}" viewBox="0 0 78 14" fill="${INK}">
          <rect x="0" y="9" width="3.2" height="4" rx="1"/><rect x="5" y="6.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3.5" width="3.2" height="9.5" rx="1"/><rect x="15" y="0.5" width="3.2" height="12.5" rx="1"/>
          <path d="M33.5 3.1c2.6 0 5 1 6.8 2.7l-1.3 1.4a8 8 0 0 0-11 0l-1.3-1.4a9.9 9.9 0 0 1 6.8-2.7zm0 3.7c1.6 0 3.1.6 4.2 1.7l-1.3 1.4a4.2 4.2 0 0 0-5.8 0l-1.3-1.4a6.1 6.1 0 0 1 4.2-1.7zm0 3.6c.7 0 1.3.3 1.8.7l-1.8 1.9-1.8-1.9c.5-.4 1.1-.7 1.8-.7z"/>
          <rect x="48.5" y="1" width="24" height="12" rx="3.6" fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="1"/><rect x="50.2" y="2.7" width="20.6" height="8.6" rx="2.2"/><rect x="74" y="4.8" width="1.6" height="4.4" rx="0.8" fill-opacity="0.45"/>
        </svg>
        <div style="position:absolute;left:50%;bottom:${px(8)};width:${px(138)};height:${px(5)};margin-left:${px(-69)};border-radius:${px(3)};background:${INK}"></div>
      </div>
    </div>`;
}

/** The record as paper: the top of its page, large enough to read, running off the foot of the picture. */
function sheetHtml(img) {
  return `<div class="sheet"><img src="data:image/png;base64,${img}"></div>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  try {
    const { context, page } = await newPhone(browser, { label: 'store', viewport: APP, scale: 3 });
    const h = helpers(page);
    const tops = {};
    const raw = async (name) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(RAW, `${name}.png`) });
      // The colour at the very top of the screen, to carry up behind the status bar.
      tops[name] = await page.evaluate(() => {
        let el = document.elementFromPoint(4, 2);
        while (el) {
          const c = getComputedStyle(el).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
          el = el.parentElement;
        }
        return null;
      });
    };

    await start(page, url);
    await h.tap('welcome-skip');
    await h.loadSample();

    // The Pro screen as a person on the free version sees it: this one goes with the purchase, for App Review.
    await h.tab('Settings');
    await h.tap('pro-row');
    await h.t('pro-screen').waitFor();
    await h.sees('Free looks after 2 things');
    await raw('pro-screen');
    await h.tap('pro-close');
    // Pro on for the pictures (the record needs it), and reminders on, so the Due tab is not asking about them.
    await h.pretendPro(true);
    await h.tap('reminders-switch');
    await h.t('coming').waitFor();

    // 1. What is due.
    await h.tab('Due');
    await h.t('section-overdue').waitFor();
    await h.gone('reminders-off');
    await raw('01-due');

    // 3. A car, with its odometer and its jobs.
    await h.tab('Things');
    await h.openThing('Outback');
    await raw('03-car');

    // 5. Its service record: the top of the page, as the PDF lays it out.
    const [record] = await Promise.all([page.waitForEvent('popup'), h.tap('thing-record')]);
    await record.waitForLoadState();
    await record.getByText('Service record').first().waitFor();
    await record.setViewportSize({ width: RECORD_W, height: 1700 });
    await record.addStyleTag({ content: 'html { background: #fff; } body { padding: 34px 28px 0 !important; margin: 0 !important; max-width: none !important; }' });
    await record.waitForTimeout(400);
    const height = await record.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await record.screenshot({ path: path.join(RAW, '05-record.png'), clip: { x: 0, y: 0, width: RECORD_W, height: Math.min(height + 30, 1040) } });
    await record.close();

    // 2. One job: how far along it is, and the ring that marks it done.
    await h.openJob('Tire rotation');
    await raw('02-job');
    await h.back();
    await h.back();

    // 4. The log.
    await h.tab('Log');
    await h.t('year-2026').waitFor();
    await raw('04-log');

    if (problems.length > 0) throw new Error(problems.join('; '));

    // Each picture under its caption, on the app's own wall.
    const font = fs.readFileSync(FONT).toString('base64');
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const img = fs.readFileSync(path.join(RAW, `${shot.file}.png`)).toString('base64');
      const lines = shot.caption.split('\n').map((l) => `<div>${l}</div>`).join('');
      await sheet.setContent(`<!doctype html><html><head><style>
        @font-face { font-family: Display; src: url(data:font/ttf;base64,${font}); }
        html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; background: #DDE3E6; overflow: hidden; }
        .caption { position: absolute; top: 120px; left: 0; right: 0; text-align: center; font: 600 112px/118px Display, sans-serif; letter-spacing: 0.2px; color: #1D4F7C; }
        .phone { position: absolute; top: 440px; left: 50%; transform: translateX(-50%); box-sizing: content-box; border: 22px solid #111112; border-radius: 156px;
                 box-shadow: 0 0 0 4px #3B3B3F, 0 0 0 6px #18181A, 0 50px 110px rgba(18, 36, 52, 0.26); background: #111112; }
        .btn { position: absolute; width: 9px; border-radius: 4px; background: #2A2A2D; }
        .screen { position: absolute; inset: 0; overflow: hidden; }
        .sheet { position: absolute; top: 440px; left: 50%; width: 1160px; margin-left: -580px; background: #fff; border-radius: 10px; overflow: hidden;
                 box-shadow: 0 0 0 2px #CBD3D6, 0 30px 90px rgba(18, 36, 52, 0.22); }
        .sheet img { width: 100%; display: block; }
      </style></head><body><div class="caption">${lines}</div>${shot.kind === 'sheet' ? sheetHtml(img) : phoneHtml(img, tops[shot.file] || WALL)}</body></html>`);
      await sheet.evaluate(() => document.fonts.ready);
      await sheet.waitForTimeout(250);
      await sheet.screenshot({ path: path.join(OUT, `${shot.file}.png`), omitBackground: false });
    }
    for (const stale of fs.readdirSync(OUT)) {
      if (/^\d\d-.*\.png$/.test(stale) && !SHOTS.some((s) => `${s.file}.png` === stale)) fs.unlinkSync(path.join(OUT, stale));
    }
    fs.copyFileSync(path.join(RAW, 'pro-screen.png'), path.join(OUT, 'iap-review-pro-screen.png'));
    await context.close();
    console.log(`Store screenshots: ${OUT}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
