// Makes the App Store screenshots: fills the app in a headless browser with a small,
// believable household (15 things, about $9,000), photographs four screens and the
// report itself, and sets each under a short caption on a 1320 x 2868 page (the 6.9-inch
// iPhone size App Store Connect asks for). The four screens sit inside a plain phone
// outline with a status bar, as they would be seen in the hand; the report is shown as
// the sheet of paper it becomes. Also saves the Pro screen by itself, which the in-app
// purchase needs for review.
//
//   APP_BASE_URL=/game-studio/apps/plainproof npx expo export --platform web
//   node e2e/store-shots.cjs [out folder]      (default: store/plainproof/screenshots)
//
// The pictures come from the web build, which draws the same screens with the
// same code; the iPhone's own tab bar, symbols and alerts differ slightly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');
const { helpers, FIXTURES, UA } = require('./run.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'store', 'plainproof', 'screenshots'));
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'plainproof-store-'));
const PAGE = { width: 1320, height: 2868 };
const FONT = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'newsreader', '600SemiBold', 'Newsreader_600SemiBold.ttf');

// A 393 x 852 point phone screen: 54 points of status bar, then the app.
const STATUS = 54;
const SCREEN = { width: 393, height: 852 };
const APP = { width: SCREEN.width, height: SCREEN.height - STATUS };
const PAPER = '#F5F1E8';

const SHOTS = [
  { file: '01-rooms', kind: 'phone', caption: 'Know what you own,\nbefore you need to.' },
  { file: '02-report', kind: 'sheet', caption: 'A clean report,\nready for your insurer.' },
  { file: '03-item', kind: 'phone', caption: 'A photo, a value,\na serial number.' },
  { file: '04-items', kind: 'phone', caption: 'Everything in one list,\nmost valuable first.' },
  { file: '05-places', kind: 'phone', caption: 'Every place you insure,\neach with its own report.' },
];

// name, room, category, value, brand, model, serial, photo
const THINGS = [
  ['65-inch OLED television', 'Living room', 'Electronics', '1899', 'Norvik', 'OL65-A2', 'NV65A2X0418K', 'television.jpg'],
  ['Three-seat sofa, oatmeal linen', 'Living room', 'Furniture', '1150', 'Fieldhouse', 'Marlow', '', 'sofa.jpg'],
  ['Brass floor lamp', 'Living room', 'Furniture', '129', 'Lumen & Co', '', '', 'lamp.jpg'],
  ['Stand mixer, 5 qt', 'Kitchen', 'Appliances', '379', 'Carrow', 'Artisan 5', 'CW5Q-2207-1184', 'mixer.jpg'],
  ['Espresso machine', 'Kitchen', 'Appliances', '499', 'Brevia', 'Barista 870', 'BV870-449120', ''],
  ['Microwave oven', 'Kitchen', 'Appliances', '159', 'Norvik', 'MW-1100', 'NVMW11-60233', ''],
  ['Queen mattress', 'Bedroom', 'Furniture', '795', 'Driftwell', 'Hybrid', '', ''],
  ['Six-drawer dresser', 'Bedroom', 'Furniture', '420', 'Fieldhouse', 'Lowe', '', ''],
  ['Automatic wristwatch', 'Bedroom', 'Jewelry and watches', '650', 'Halden', 'Field 38', '', ''],
  ['14-inch laptop', 'Home office', 'Electronics', '1299', 'Orchard', 'Pro 14', 'C02XK4Q7ORCH', 'laptop.jpg'],
  ['27-inch monitor', 'Home office', 'Electronics', '329', 'Dellan', 'U2724', 'DL27-88410-TQ', ''],
  ['Mesh task chair', 'Home office', 'Furniture', '289', 'Hartwell', 'Aero B', '', ''],
  ['Hybrid bicycle, size L', 'Garage', 'Sports and outdoors', '749', 'Trail & Co', 'FX 3', 'WTU118C0447N', 'bicycle.jpg'],
  ['Cordless drill and driver kit', 'Garage', 'Tools', '189', 'Yellowjack', 'DCK240', 'YJ-240-771305', ''],
  ['Self-propelled lawn mower', 'Garage', 'Tools', '399', 'Hondo', 'HRX 217', 'MZCG-8840912', ''],
];
const TOTAL = '$9,334';

async function addThing(h, t, [name, room, category, value, brand, model, serial, photo], first) {
  await h.visible('item-form');
  await h.fill('field-name', name);
  await h.tap('field-room');
  await h.choose(room);
  await h.tap('field-category');
  await h.choose(category);
  await h.fill('field-value', value);
  if (brand) await h.fill('field-brand', brand);
  if (model) await h.fill('field-model', model);
  if (serial) await h.fill('field-serial', serial);
  if (first) {
    // The television carries everything a claim asks for, receipt included; the figures match the receipt in the picture.
    await h.fill('field-date', '2021-03-04');
    await h.fill('field-shop', 'Brightway Electronics');
    await h.fill('field-paid', '1899.00');
    await h.fill('field-notes', 'Wall bracket and care plan on the same receipt.');
    await h.upload('receipts-add', path.join(FIXTURES, 'receipt.jpg'));
    await h.visible('receipts-remove-0', 15000);
  }
  if (photo) {
    await h.upload('photos-add', path.join(FIXTURES, photo));
    await h.visible('photos-remove-0', 15000);
  }
}

/** A plain phone: dark edge, rounded corners, a camera cut-out, a status bar and the bar at the foot. */
function phoneHtml(img, top) {
  const scale = 2.672; // points to pixels on the page
  const px = (n) => `${(n * scale).toFixed(1)}px`;
  const ink = '#1C1B18';
  return `
    <div class="phone" style="width:${px(SCREEN.width)};height:${px(SCREEN.height)}">
      <div class="btn" style="left:-31px;top:${px(170)};height:${px(32)}"></div>
      <div class="btn" style="left:-31px;top:${px(232)};height:${px(60)}"></div>
      <div class="btn" style="left:-31px;top:${px(306)};height:${px(60)}"></div>
      <div class="btn" style="right:-31px;top:${px(262)};height:${px(96)}"></div>
      <div class="screen" style="border-radius:${px(50)};background:${top}">
        <img src="data:image/png;base64,${img}" style="position:absolute;left:0;top:${px(STATUS)};width:${px(APP.width)};height:${px(APP.height)}">
        <div style="position:absolute;left:${px(40)};top:${px(18)};font:600 ${px(16.5)}/${px(22)} system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;color:${ink}">9:41</div>
        <div style="position:absolute;left:50%;top:${px(11)};width:${px(122)};height:${px(35)};margin-left:${px(-61)};border-radius:${px(20)};background:#0B0B0C"></div>
        <svg style="position:absolute;right:${px(30)};top:${px(21)}" width="${px(78)}" height="${px(14)}" viewBox="0 0 78 14" fill="${ink}">
          <rect x="0" y="9" width="3.2" height="4" rx="1"/><rect x="5" y="6.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3.5" width="3.2" height="9.5" rx="1"/><rect x="15" y="0.5" width="3.2" height="12.5" rx="1"/>
          <path d="M33.5 3.1c2.6 0 5 1 6.8 2.7l-1.3 1.4a8 8 0 0 0-11 0l-1.3-1.4a9.900 9.900 0 0 1 6.800-2.700zm0 3.700c1.600 0 3.100.6 4.200 1.700l-1.300 1.400a4.200 4.200 0 0 0-5.800 0l-1.300-1.400a6.100 6.100 0 0 1 4.200-1.700zm0 3.600c.7 0 1.300.3 1.800.7l-1.800 1.900-1.800-1.900c.5-.400 1.100-.700 1.800-.700z"/>
          <rect x="48.500" y="1" width="24" height="12" rx="3.600" fill="none" stroke="${ink}" stroke-opacity="0.400" stroke-width="1"/><rect x="50.200" y="2.700" width="20.600" height="8.600" rx="2.200"/><rect x="74" y="4.800" width="1.600" height="4.400" rx="0.800" fill-opacity="0.450"/>
        </svg>
        <div style="position:absolute;left:50%;bottom:${px(8)};width:${px(138)};height:${px(5)};margin-left:${px(-69)};border-radius:${px(3)};background:${ink}"></div>
      </div>
    </div>`;
}

/** The report as paper: the top of its first page, large enough to read, running off the foot of the picture. */
function sheetHtml(img) {
  return `<div class="sheet"><img src="data:image/png;base64,${img}"></div>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, url } = await listen();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: APP, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'light', acceptDownloads: true, locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const h = helpers(page);
    const t = h.t;
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

    await page.goto(url);
    await h.onboard(['Living room', 'Kitchen', 'Bedroom', 'Home office', 'Garage']);
    await h.tab('Report');
    await h.fill('profile-home', '14 Alder Lane');
    await h.fill('profile-owner', 'R. and J. Marlow');
    await h.fill('profile-insurer', 'Fernbrook Mutual');
    await h.fill('profile-policy', 'HO-48213-07');
    await h.tab('Rooms');

    await h.tap('add-item');
    for (let i = 0; i < THINGS.length; i++) {
      await addThing(h, t, THINGS[i], i === 0);
      if (i < THINGS.length - 1) {
        await h.tap('form-save-another');
        await h.expectText('field-name', '');
      } else {
        await h.tap('form-save');
      }
    }
    await h.visible('rooms-screen');
    await h.expectText('home-total', TOTAL);
    await h.expectText('home-count', '15 items in 5 rooms');

    // The Pro screen as a person on the free version sees it: this one goes with the purchase, for App Review.
    await h.tab('Settings');
    await h.tap('pro-row');
    await h.visible('pro-screen');
    await raw('pro-screen');
    await h.tap('pro-close');
    await h.gone('pro-screen');
    // Pro on for the pictures: the line about the free version is something a person meets in the app, not in the store.
    await h.tap('dev-pretend-pro');

    // A backup, so the Rooms tab is not asking for one in the picture.
    await h.tab('Report');
    await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
    await h.expectText('last-backup', 'Last backed up today.');

    // The report itself: the top of its first page, as the PDF lays it out.
    const [report] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
    await report.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
    await report.setViewportSize({ width: 816, height: 1720 });
    await report.addStyleTag({ content: 'html { background: #fff; } body { padding: 58px 54px 0 !important; }' });
    await report.waitForTimeout(400);
    await report.screenshot({ path: path.join(RAW, '02-report.png'), clip: { x: 0, y: 0, width: 816, height: 1720 } });
    await report.close();

    // 1. The drawer.
    await h.tab('Rooms');
    await h.bringToFront('Living room');
    await raw('01-rooms');

    // 3. One item, with its photo and its numbers.
    await h.openRoom('Living room');
    await h.tap('item-65-inch OLED television');
    await h.visible('item-screen');
    await raw('03-item');
    await h.back();
    await h.back();

    // 4. The list, the most valuable things first.
    await h.tab('Items');
    await h.tap('items-sort');
    await h.choose('Most valuable first');
    await raw('04-items');

    // 5. The cabinets, with a second and a third place.
    await h.tab('Rooms');
    await h.tap('places');
    await h.visible('places-screen');
    for (const [kind, name, thing, worth] of [['Rental property', 'Lake cabin', 'Canoe', '900'], ['Storage unit', 'Storage unit', 'Winter tires', '640']]) {
      await h.tap('place-add');
      await h.answer(name);
      await h.choose(kind);
      await h.gone('places-screen');
      await h.tap('add-item');
      await h.quickAdd(thing, worth);
      await h.tap('form-save');
      await h.visible('rooms-screen');
      await h.tap('places');
      await h.visible('places-screen');
    }
    await h.tap('place-14 Alder Lane');
    await h.gone('places-screen');
    await h.tap('places');
    await h.visible('places-screen');
    await raw('05-places');

    if (errors.length > 0) throw new Error('page errors: ' + errors.join('; '));

    // Each picture under its caption, on the app's own paper.
    const font = fs.readFileSync(FONT).toString('base64');
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const img = fs.readFileSync(path.join(RAW, `${shot.file}.png`)).toString('base64');
      const lines = shot.caption.split('\n').map((l) => `<div>${l}</div>`).join('');
      await sheet.setContent(`<!doctype html><html><head><style>
        @font-face { font-family: Display; src: url(data:font/ttf;base64,${font}); }
        html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; background: #F3EFE6; overflow: hidden; }
        .caption { position: absolute; top: 128px; left: 0; right: 0; text-align: center; font: 600 92px/106px Display, serif; letter-spacing: -1.5px; color: #1C1B18; }
        .phone { position: absolute; top: 440px; left: 50%; transform: translateX(-50%); box-sizing: content-box; border: 22px solid #111112; border-radius: 156px;
                 box-shadow: 0 0 0 4px #3B3B3F, 0 0 0 6px #18181A, 0 50px 110px rgba(52, 40, 18, 0.26); background: #111112; }
        .btn { position: absolute; width: 9px; border-radius: 4px; background: #2A2A2D; }
        .screen { position: absolute; inset: 0; overflow: hidden; }
        .sheet { position: absolute; top: 430px; left: 50%; width: 1180px; margin-left: -590px; background: #fff; border-radius: 10px 10px 0 0; overflow: hidden;
                 box-shadow: 0 0 0 2px #E2DBCB, 0 30px 90px rgba(52, 40, 18, 0.22); }
        .sheet img { width: 100%; display: block; }
      </style></head><body><div class="caption">${lines}</div>${shot.kind === 'sheet' ? sheetHtml(img) : phoneHtml(img, tops[shot.file] || PAPER)}</body></html>`);
      await sheet.evaluate(() => document.fonts.ready);
      await sheet.waitForTimeout(250);
      await sheet.screenshot({ path: path.join(OUT, `${shot.file}.png`), omitBackground: false });
    }
    for (const stale of fs.readdirSync(OUT)) {
      if (/^\d\d-.*\.png$/.test(stale) && !SHOTS.some((s) => `${s.file}.png` === stale)) fs.unlinkSync(path.join(OUT, stale));
    }
    fs.copyFileSync(path.join(RAW, 'pro-screen.png'), path.join(OUT, 'iap-review-pro-screen.png'));
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
