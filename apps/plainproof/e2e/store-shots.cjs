// Makes the App Store screenshots: uses the app in a headless browser with the
// sample home, photographs five screens, and sets each under a short caption
// on a 1320 x 2868 page (the 6.9-inch iPhone size App Store Connect asks for).
// Also saves the Pro screen by itself, which the in-app purchase needs for review.
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
const { helpers, FIXTURES, PHONE, UA } = require('./run.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'store', 'plainproof', 'screenshots'));
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'plainproof-store-'));
const PAGE = { width: 1320, height: 2868 };
const FONT = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'newsreader', '600SemiBold', 'Newsreader_600SemiBold.ttf');

const SHOTS = [
  { file: '01-rooms', caption: 'Know what you own,\nbefore you need to.' },
  { file: '02-item', caption: 'A photo, a value,\na serial number, a receipt.' },
  { file: '03-report', caption: 'A report ready\nfor your insurer.' },
  { file: '04-items', caption: 'Everything in one list,\nmost valuable first.' },
  { file: '05-places', caption: 'Free for 20 items.\nPro: unlimited, more places.' },
];

async function addPhotos(h, room, item, photos, receipt) {
  await h.openRoom(room);
  await h.tap(`item-${item}`);
  await h.tap('item-edit');
  await h.visible('item-form');
  await h.upload('photos-add', photos.map((p) => path.join(FIXTURES, p)));
  await h.visible(`photos-remove-${photos.length - 1}`, 15000);
  if (receipt) {
    await h.upload('receipts-add', path.join(FIXTURES, receipt));
    await h.visible('receipts-remove-0', 15000);
  }
  await h.tap('form-save');
  await h.visible('item-screen');
  await h.back();
  await h.back();
  await h.visible('rooms-screen');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, url } = await listen();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'light', acceptDownloads: true, locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const h = helpers(page);
    const raw = async (name) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(RAW, `${name}.png`) });
    };

    await page.goto(url);
    await h.onboard(['Living room']);
    await h.tab('Settings');
    await h.tap('dev-sample');
    await h.confirm(); // "Sample home loaded": the inventory was empty, so there was nothing to ask about replacing

    // The Pro screen as a person on the free version sees it: this one goes with the purchase, for App Review.
    await h.tap('pro-row');
    await h.visible('pro-screen');
    await raw('pro-screen');
    await h.tap('pro-close');
    await h.gone('pro-screen');
    await h.tap('dev-pretend-pro');

    await h.tab('Report');
    await h.fill('profile-owner', 'R. and J. Marlow');
    await h.fill('profile-insurer', 'Fernbrook Mutual');
    await h.fill('profile-policy', 'HO-48213-07');
    await h.tab('Rooms');

    await addPhotos(h, 'Living room', '65-inch OLED television', ['television.jpg'], 'receipt.jpg');
    await addPhotos(h, 'Living room', 'Three-seat sofa, oatmeal linen', ['sofa.jpg']);
    await addPhotos(h, 'Living room', 'Brass floor lamp', ['lamp.jpg']);
    await addPhotos(h, 'Kitchen', 'Stand mixer, 5 qt', ['mixer.jpg']);
    await addPhotos(h, 'Home office', '14-inch laptop', ['laptop.jpg']);
    await addPhotos(h, 'Garage', 'Hybrid bicycle, size L', ['bicycle.jpg']);

    // A backup, so the Rooms tab is not asking for one in the picture.
    await h.tab('Report');
    await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
    await h.expectText('last-backup', 'Last backed up today.');

    // 1. The drawer.
    await h.tab('Rooms');
    await h.bringToFront('Living room');
    await raw('01-rooms');

    // 2. One item, with its photo, its numbers and its receipt.
    await h.openRoom('Living room');
    await h.tap('item-65-inch OLED television');
    await h.visible('item-screen');
    await raw('02-item');
    await h.back();
    await h.back();

    // 3. The report. The note about the web preview is not part of the app on an iPhone.
    await h.tab('Report');
    await page.evaluate(() => {
      // The note is a box with a symbol and a line of text: hide the box. The button's words are the iPhone's.
      for (const el of document.querySelectorAll('div')) {
        if (el.children.length === 0 && /^In this web preview/.test(el.textContent || '')) el.parentElement.style.display = 'none';
        if (el.children.length === 0 && el.textContent === 'Open the report') el.textContent = 'Create the PDF report';
      }
      const screen = document.querySelector('[data-testid="report-screen"]');
      if (screen) screen.scrollTop = 0;
    });
    await raw('03-report');

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

    // Each screen under its caption, on the app's own paper.
    const font = fs.readFileSync(FONT).toString('base64');
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const img = fs.readFileSync(path.join(RAW, `${shot.file}.png`)).toString('base64');
      const lines = shot.caption.split('\n').map((l) => `<div>${l}</div>`).join('');
      await sheet.setContent(`<!doctype html><html><head><style>
        @font-face { font-family: Display; src: url(data:font/ttf;base64,${font}); }
        html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; background: #F3EFE6; overflow: hidden; }
        .caption { position: absolute; top: 150px; left: 0; right: 0; text-align: center; font: 600 92px/108px Display, serif; letter-spacing: -1.5px; color: #1C1B18; }
        .phone { position: absolute; top: 470px; left: 50%; width: 1076px; height: 2333px; margin-left: -538px; border-radius: 84px; overflow: hidden;
                 box-shadow: 0 0 0 3px #DCD5C5, 0 40px 90px rgba(60, 48, 24, 0.18); background: #F6F3EC; }
        .phone img { width: 100%; height: 100%; display: block; }
      </style></head><body><div class="caption">${lines}</div><div class="phone"><img src="data:image/png;base64,${img}"></div></body></html>`);
      await sheet.evaluate(() => document.fonts.ready);
      await sheet.waitForTimeout(200);
      await sheet.screenshot({ path: path.join(OUT, `${shot.file}.png`), omitBackground: false });
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
