// Uses the app from end to end in a headless browser, the way a person would
// on a phone: first run, adding and editing things, the edge cases, the
// report, a backup and a restore, the free limit and Pro, and a very large
// home. It fails on any broken expectation and on any console error.
//
//   APP_BASE_URL=/game-studio/apps/plainproof npx expo export --platform web
//   node e2e/run.cjs                # screenshots go to a temp folder
//   SHOTS_DIR=/some/folder node e2e/run.cjs
//
// Needs Playwright with Chromium (the studio workspace has both).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { unzipSync, strFromU8 } = require('fflate');

const { listen, BASE } = require('./serve.cjs');

const FIXTURES = path.join(__dirname, 'fixtures');
const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'plainproof-shots-'));
const PHONE = { width: 393, height: 852 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const problems = [];
const timings = {};
let stepCount = 0;
let lastPage = null;

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] page error: ${e.message}`));
}

async function newPhone(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
    colorScheme: opts.dark ? 'dark' : 'light',
    acceptDownloads: true,
    locale: 'en-US',
  });
  const page = await context.newPage();
  watch(page, opts.label || 'phone');
  lastPage = page;
  return { context, page };
}

async function step(name, fn) {
  stepCount += 1;
  const started = Date.now();
  try {
    await fn();
    console.log(`ok   ${String(stepCount).padStart(2)}  ${name}  (${Date.now() - started} ms)`);
  } catch (e) {
    console.log(`FAIL ${String(stepCount).padStart(2)}  ${name}\n     ${String(e && e.message).split('\n').join('\n     ')}`);
    if (lastPage) await lastPage.screenshot({ path: path.join(SHOTS, `FAILED-step-${stepCount}.png`) }).catch(() => {});
    problems.push(`step "${name}": ${e && e.message}`);
    throw e;
  }
}

function helpers(page) {
  // Tab screens stay mounted when hidden, so the same test id can exist twice:
  // always act on the one a person can see.
  const t = (id) => page.getByTestId(id).filter({ visible: true });
  const h = {
    t,
    async shot(name, opts = {}) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !!opts.fullPage });
    },
    async tap(id) {
      await t(id).first().click();
    },
    async text(id) {
      return (await t(id).first().innerText()).replace(/\s+/g, ' ').trim();
    },
    async expectText(id, expected) {
      await h.visible(id);
      const deadline = Date.now() + 5000;
      let got = '';
      while (Date.now() < deadline) {
        got = await h.text(id);
        if (expected instanceof RegExp ? expected.test(got) : got === expected) return;
        await page.waitForTimeout(100);
      }
      assert.fail(`"${id}" shows "${got}", expected ${expected}`);
    },
    async visible(id, timeout = 8000) {
      const deadline = Date.now() + timeout;
      while ((await t(id).count()) === 0) {
        if (Date.now() > deadline) assert.fail(`"${id}" never appeared`);
        await page.waitForTimeout(80);
      }
    },
    async gone(id) {
      const deadline = Date.now() + 8000;
      while ((await t(id).count()) > 0) {
        if (Date.now() > deadline) assert.fail(`"${id}" is still on screen`);
        await page.waitForTimeout(80);
      }
    },
    async fill(id, value) {
      await t(id).first().fill(value);
    },
    /** Answers the dialog on screen. */
    async dialogText() {
      await h.visible('dialog');
      return (await t('dialog').first().innerText()).replace(/\s+/g, ' ').trim();
    },
    /** Waits until the dialog that was answered has gone (another may take its place at once). */
    async answered(before) {
      const deadline = Date.now() + 15000;
      for (;;) {
        if ((await t('dialog').count()) === 0) return;
        const now = await t('dialog').first().innerText().catch(() => '');
        if (now !== before) return;
        if (Date.now() > deadline) assert.fail('the dialog is still on screen');
        await page.waitForTimeout(80);
      }
    },
    async confirm() {
      await h.visible('dialog');
      const before = await t('dialog').first().innerText();
      await t('dialog-confirm').first().click();
      await h.answered(before);
    },
    async cancel() {
      await h.visible('dialog');
      const before = await t('dialog').first().innerText();
      await t('dialog-cancel').first().click();
      await h.answered(before);
    },
    async choose(label) {
      await h.visible('dialog');
      await t('dialog').first().getByText(label, { exact: true }).click();
      await page.waitForTimeout(150);
    },
    async answer(text) {
      await h.visible('dialog-input');
      await t('dialog-input').first().fill(text);
      const before = await t('dialog').first().innerText();
      await t('dialog-confirm').first().click();
      await h.answered(before);
    },
    async upload(buttonId, files) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), t(buttonId).first().click()]);
      await chooser.setFiles(files);
    },
    async tab(name) {
      await page.getByRole('tab', { name, exact: true }).click();
      await page.waitForTimeout(200);
    },
    async back() {
      await page.goBack();
      await page.waitForTimeout(300);
    },
    async onboard(rooms) {
      await h.visible('welcome-intro');
      await h.tap('welcome-continue');
      await h.visible('welcome-rooms');
      const defaults = ['Living room', 'Kitchen', 'Bedroom', 'Bathroom'];
      for (const r of defaults) if (!rooms.includes(r)) await h.tap(`pick-${r}`);
      for (const r of rooms) if (!defaults.includes(r)) await h.tap(`pick-${r}`);
      await h.tap('welcome-finish');
      await h.visible('rooms-screen');
    },
    /** The folder's two meters: each label clear of its count, nothing wrapped onto a second line. */
    /** The welcome picture is really drawn (not a zero-size box), and the first screen fits above the button without scrolling. */
    async welcomeFits() {
      await h.visible('welcome-art');
      const art = await t('welcome-art').boundingBox();
      const promise = await t('welcome-promise').boundingBox();
      const footer = await t('welcome-footer').boundingBox();
      const view = page.viewportSize();
      assert.ok(art && art.width > view.width * 0.6 && art.height > 120, `welcome picture is ${JSON.stringify(art)}`);
      assert.ok(art.x >= 0 && art.x + art.width <= view.width + 0.5, `welcome picture runs off the screen: ${JSON.stringify(art)}`);
      const shapes = await t('welcome-art').locator('rect, path, circle, ellipse').count();
      assert.ok(shapes > 40, `welcome picture has only ${shapes} shapes`);
      assert.ok(promise.y + promise.height <= footer.y + 0.5, `welcome text runs under the button: ${JSON.stringify({ promise, footer })}`);
      assert.ok(footer.y + footer.height <= view.height + 0.5, 'welcome button is below the fold');
    },
    async metersTidy(prefix = '') {
      for (const key of ['meter-photo', 'meter-value']) {
        const label = await t(`${prefix}${key}-label`).first().boundingBox();
        const count = await t(`${prefix}${key}-count`).first().boundingBox();
        assert.ok(label && count, `${prefix}${key} is not on screen`);
        assert.ok(label.x + label.width + 4 <= count.x, `${prefix}${key}: the label runs into the count`);
        assert.ok(count.height < 24 && label.height < 24, `${prefix}${key}: the text wraps`);
        for (const part of ['label', 'count']) {
          const cut = await t(`${prefix}${key}-${part}`).first().evaluate((el) => el.scrollWidth - el.clientWidth);
          assert.ok(cut <= 0, `${prefix}${key}: the ${part} is cut off by ${cut}px`);
        }
      }
    },
    /** How far it is from one folder to the next in the drawer: one folder is one step of sliding. */
    async deckStep() {
      return Number(await t('room-deck').first().getAttribute('data-step'));
    },
    /** Whether a room's folder is the open one: what is written on it shows only then. */
    async isOpen(name) {
      return (await t(`room-writing-${name}`).first().evaluate((el) => Number(getComputedStyle(el).opacity))) > 0.99;
    },
    /** Slides the drawer until a room's folder is the open one. */
    async bringToFront(name) {
      await h.visible(`room-${name}`);
      const index = Number(await t(`room-${name}`).first().getAttribute('data-index'));
      const step = await h.deckStep();
      await t('room-deck').first().evaluate((el, top) => {
        // scrollTop, not scrollTo: on this element scrollTo takes its arguments the React Native way round.
        el.scrollTop = top;
      }, index * step);
      await page.waitForTimeout(250);
      assert.ok(await h.isOpen(name), `${name} is not the open folder`);
    },
    /** Goes into a room the way a person would: bring its folder open, then tap it. */
    async openRoom(name) {
      await h.bringToFront(name);
      await h.tap(`room-${name}`);
    },
    async quickAdd(name, value) {
      await h.visible('item-form');
      await h.fill('field-name', name);
      if (value !== undefined) await h.fill('field-value', value);
    },
  };
  return h;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await listen();
  const browser = await chromium.launch();
  const started = Date.now();
  let backupZip = null;
  let firstItemId = null;

  try {
    const { context, page } = await newPhone(browser, { label: 'main' });
    const h = helpers(page);
    const t = h.t;

    await step('fresh install lands on the welcome screen', async () => {
      await page.goto(url);
      await h.visible('welcome-intro');
      assert.ok(page.url().endsWith('/welcome'), page.url());
      await h.welcomeFits();
      await h.shot('01-welcome');
      await h.tap('welcome-continue');
      await h.visible('welcome-rooms');
      await h.tap('pick-Bathroom');
      await h.tap('pick-Home office');
      await h.tap('pick-Garage');
      await h.shot('02-welcome-rooms');
      await h.expectText('welcome-finish', 'Start with 5 rooms');
      await h.tap('welcome-finish');
      await h.visible('rooms-screen');
      // Nothing to add up yet, so no "$0" (it used to say the same thing twice).
      await h.expectText('home-empty', 'Nothing filed yet');
      assert.strictEqual(await t('home-total').count(), 0, 'an empty home shows a total');
      await h.expectText('home-count', '5 rooms ready to fill');
      await h.expectText('free-note', /Free version: 0 of 20 items used/);
      await h.shot('03-rooms-empty');
    });

    await step('empty states on the other tabs', async () => {
      await h.tab('Items');
      await h.visible('items-add-first');
      await h.shot('04-items-empty');
      await h.tab('Report');
      await h.visible('report-sheet');
      await h.expectText('last-backup', 'Nothing to back up yet.');
      await h.shot('05-report-empty');
      await h.tab('Settings');
      await h.visible('settings-screen');
      await h.shot('06-settings');
      await h.tab('Rooms');
    });

    await step('the form refuses an empty name and bad amounts', async () => {
      await h.tap('add-first-item');
      await h.visible('item-form');
      await h.shot('07-form-empty');
      await h.tap('form-save');
      await h.visible('error-name');
      await h.fill('field-value', 'abc');
      await assert.doesNotReject(page.getByText('Enter an amount, like 1,299.50').first().waitFor({ timeout: 3000 }));
      await h.fill('field-paid', '1000000000');
      await assert.doesNotReject(page.getByText('That is more than the app can hold.').first().waitFor({ timeout: 3000 }));
      await h.shot('08-form-errors');
      await h.fill('field-name', 'Test');
      await h.tap('form-save');
      await h.visible('item-form'); // still here: the amounts are wrong
      await h.fill('field-value', '');
      await h.fill('field-paid', '');
    });

    await step('add an item with every field, a photo and a receipt', async () => {
      await h.fill('field-name', '65-inch OLED television');
      await h.tap('field-room');
      await h.choose('Living room');
      await h.tap('field-category');
      await h.choose('Electronics');
      await h.fill('field-value', '1,899');
      await h.tap('field-quantity-more');
      await h.expectText('field-quantity', '2');
      await h.tap('field-quantity-less');
      await h.expectText('field-quantity', '1');
      await h.fill('field-brand', 'Norvik');
      await h.fill('field-model', 'OL65-A2');
      await h.fill('field-serial', 'NV65A2X0418K');
      await h.fill('field-date', '2021-03-04');
      await h.fill('field-shop', 'Brightway Electronics');
      await h.fill('field-paid', '1799.99');
      await h.fill('field-notes', 'Wall bracket and care plan on the same receipt.\nBox is in the attic.');
      await h.upload('photos-add', path.join(FIXTURES, 'television.jpg'));
      await h.visible('photos-remove-0', 15000);
      await h.upload('receipts-add', path.join(FIXTURES, 'receipt.jpg'));
      await h.visible('receipts-remove-0', 15000);
      await t('item-form').first().evaluate((el) => el.scrollTo(0, 0));
      await h.shot('09-form-filled');
      await h.shot('09b-form-filled-full', { fullPage: true });
      await h.tap('form-save');
      await h.visible('rooms-screen');
      await h.expectText('home-total', '$1,899');
      await h.expectText('home-count', '1 item in 5 rooms');
      // The drawer: every room's folder is on the screen at once, one under the other, and the first is the open one.
      const five = ['Living room', 'Kitchen', 'Bedroom', 'Home office', 'Garage'];
      const tops = [];
      for (const room of five) tops.push((await t(`room-tab-${room}`).first().boundingBox()).y);
      for (let i = 1; i < tops.length; i++) assert.ok(tops[i] > tops[i - 1] + 20, `folder ${i + 1} is not below folder ${i} (${tops.join(', ')})`);
      const addRoom = await t('add-room').first().boundingBox();
      assert.ok(tops[tops.length - 1] + 20 < addRoom.y, 'the last folder is not on the screen above the row under the drawer');
      assert.ok(await h.isOpen('Living room'), 'the first folder is not open to begin with');
      for (const room of five.slice(1)) assert.ok(!(await h.isOpen(room)), `${room} is open as well as the first folder`);
      // The open folder shows more of itself: the gap under it is wider than the gap under a closed one.
      assert.ok(tops[1] - tops[0] > tops[2] - tops[1] + 40, `the open folder is no taller than a closed one (${tops.join(', ')})`);
      // The name on a tab must stop short of the tab's slanted edge, and the tabs step across as cut tabs do.
      for (const room of five) {
        const label = await t(`room-tab-${room}`).first().boundingBox();
        const slant = await t(`room-slant-${room}`).first().boundingBox();
        assert.ok(slant.x + slant.width <= page.viewportSize().width - 18, `${room}: the tab runs off the folder`);
        assert.ok(label.x + label.width <= slant.x + 0.5, `${room}: the name runs under the tab's edge`);
      }
      const tabX = async (room) => (await t(`room-tab-${room}`).first().boundingBox()).x;
      assert.ok((await tabX('Kitchen')) > (await tabX('Living room')) + 40, 'the tabs are not staggered');
      assert.ok((await tabX('Bedroom')) > (await tabX('Kitchen')) + 40, 'the third tab is not further across than the second');
      assert.ok(Math.abs((await tabX('Home office')) - (await tabX('Living room'))) < 1, 'the fourth tab is not back in the first position');
      // The whole screen fits: nothing on the Rooms tab scrolls but the drawer.
      const fits = await t('rooms-screen').first().evaluate((el) => el.scrollHeight - el.clientHeight);
      assert.ok(fits <= 1, `the Rooms screen overflows by ${fits}`);
      await h.shot('10-rooms-one-item');
    });

    await step('the room and the item show what was entered', async () => {
      await h.openRoom('Living room');
      await h.visible('room-screen');
      await h.expectText('room-summary', '1 item · $1,899');
      await h.shot('11-room');
      await h.tap('item-65-inch OLED television');
      await h.visible('item-screen');
      firstItemId = page.url().split('/item/')[1];
      await h.expectText('item-value', '$1,899'); // whole amounts in the app, as in the lists; cents only when there are some
      await h.expectText('fact-serial', 'NV65A2X0418K');
      await h.expectText('item-notes', /Wall bracket and care plan/);
      const body = await t('item-screen').first().innerText();
      for (const s of ['Norvik', 'OL65-A2', 'Mar 4, 2021', 'Brightway Electronics', '$1,799.99', 'Living room · Electronics']) {
        assert.ok(body.includes(s), `item screen is missing "${s}"`);
      }
      await h.shot('12-item');
      await h.shot('12b-item-full', { fullPage: true });
      await h.tap('receipt-0');
      await h.visible('photo-screen');
      await h.shot('13-photo-viewer');
      await h.tap('photo-close');
      await h.visible('item-screen');
    });

    await step('editing: the largest amount fits, cancel asks before discarding', async () => {
      await h.tap('item-edit');
      await h.visible('item-form');
      await h.fill('field-value', '999999999.99');
      await h.tap('field-quantity-more');
      await h.tap('form-save');
      await h.visible('item-screen');
      await h.expectText('item-value', '$1,999,999,999.98');
      await h.shot('14-item-huge-value');
      await h.back();
      await h.back();
      await h.visible('rooms-screen');
      await h.expectText('home-total', '$1,999,999,999.98');
      // It used to end in an ellipsis; now the figure steps down in size until it fits.
      const cut = await t('home-total').first().evaluate((el) => el.scrollWidth - el.clientWidth);
      assert.ok(cut <= 0, `the largest total is cut off by ${cut}px`);
      await h.shot('15-rooms-huge-value');
      // Put it back, and check that Cancel asks first.
      await h.openRoom('Living room');
      await h.tap('item-65-inch OLED television');
      await h.tap('item-edit');
      await h.fill('field-value', '1899');
      await h.tap('field-quantity-less');
      await h.tap('form-save');
      await h.expectText('item-value', '$1,899');
      await h.tap('item-edit');
      await h.fill('field-name', 'Something else entirely');
      await h.tap('form-cancel');
      assert.match(await h.dialogText(), /Discard your changes\?/);
      await h.cancel(); // keep editing
      await h.visible('item-form');
      await h.tap('form-cancel');
      await h.confirm(); // discard
      await h.expectText('item-title', '65-inch OLED television');
      await h.back();
      await h.back();
    });

    await step('a very long name, save-and-add-another, and photos on more items', async () => {
      const longName = 'Grandmother’s hand-painted porcelain dinner service with gold rims, twelve settings, serving dishes and gravy boat';
      await h.tap('add-item');
      await h.quickAdd(longName, '2400');
      await h.tap('field-room');
      await h.choose('Kitchen');
      await h.tap('form-save-another');
      await h.expectText('field-room', /Kitchen/); // the next one starts in the same room
      await h.quickAdd('Stand mixer, 5 qt', '449');
      await h.tap('field-category');
      await h.choose('Appliances');
      await h.upload('photos-add', path.join(FIXTURES, 'mixer.jpg'));
      await h.visible('photos-remove-0', 15000);
      await h.tap('form-save-another');
      await h.quickAdd('Three-seat sofa, oatmeal linen', '1450');
      await h.tap('field-room');
      await h.choose('Living room');
      await h.upload('photos-add', [path.join(FIXTURES, 'sofa.jpg'), path.join(FIXTURES, 'lamp.jpg')]);
      await h.visible('photos-remove-1', 15000);
      await h.tap('form-save-another');
      await h.quickAdd('14-inch laptop');
      await h.tap('field-room');
      await h.choose('Home office');
      await h.tap('field-category');
      await h.choose('Electronics');
      await h.upload('photos-add', path.join(FIXTURES, 'laptop.jpg'));
      await h.visible('photos-remove-0', 15000);
      await h.tap('form-save-another');
      await h.quickAdd('Hybrid bicycle, size L', '899');
      await h.tap('field-room');
      await h.choose('Garage');
      await h.tap('field-category');
      await h.choose('Sports and outdoors');
      await h.upload('photos-add', path.join(FIXTURES, 'bicycle.jpg'));
      await h.visible('photos-remove-0', 15000);
      await h.tap('form-save');
      await h.visible('rooms-screen');
      await h.expectText('home-count', '6 items in 5 rooms');
      await h.expectText('home-total', '$7,097');
      await h.visible('gap-no-value');
      await h.visible('gap-no-serial');
      await h.shot('16-rooms-filled');
      await h.shot('16b-rooms-filled-full', { fullPage: true });
      await h.openRoom('Kitchen');
      await h.shot('17-room-long-name');
      await h.tap(`item-${longName}`);
      await h.expectText('item-title', longName);
      await h.shot('18-item-long-name');
      await h.back();
      await h.back();
    });

    await step('rooms: add, rename, change symbol, reorder, delete with a move', async () => {
      await h.tap('add-room');
      await h.answer('Shed');
      await h.visible('room-Shed');
      await h.tap('add-room');
      await h.answer('   ');
      assert.strictEqual(await page.getByText('Nothing here yet').filter({ visible: true }).count(), 2, 'an empty name made a room');
      await h.openRoom('Shed');
      await h.visible('room-add-first');
      await h.shot('19-room-empty');
      await h.tap('room-menu');
      await h.shot('20-room-menu');
      await h.choose('Rename');
      await h.answer('Garden shed');
      await h.expectText('room-title', 'Garden shed');
      await h.tap('room-menu');
      await h.choose('Change symbol');
      await h.choose('Tree');
      await h.tap('room-menu');
      await h.choose('Move up');
      await h.tap('room-menu');
      await h.choose('Delete room');
      assert.match(await h.dialogText(), /Delete Garden shed\?/);
      await h.confirm();
      await h.visible('rooms-screen');
      assert.strictEqual(await t('room-Garden shed').count(), 0);
      // A room with something in it asks where the things should go.
      await h.openRoom('Garage');
      await h.tap('room-menu');
      await h.choose('Delete room');
      assert.match(await h.dialogText(), /Garage has 1 item/);
      assert.match(await h.dialogText(), /What should happen to it\?/); // one thing is "it", not "them"
      await h.shot('21-delete-room-choice');
      await h.choose('Move to Home office');
      assert.match(await h.dialogText(), /moved, not deleted/);
      await h.confirm();
      await h.visible('rooms-screen');
      await h.expectText('home-count', '6 items in 4 rooms');
      await h.expectText('home-total', '$7,097');
    });

    await step('items tab: search, filters, sorting and the gaps shortcut', async () => {
      await h.tab('Items');
      await h.visible('items-search');
      await h.expectText('items-count', '6 items');
      await h.shot('22-items');
      await h.fill('items-search', 'OLED');
      await h.expectText('items-count', '1 item found');
      await h.fill('items-search', 'nv65a2x');
      await h.expectText('items-count', '1 item found'); // serial numbers are searchable
      await h.fill('items-search', 'home office laptop');
      await h.expectText('items-count', '1 item found'); // so is the room
      await h.fill('items-search', 'zzzz');
      // The empty state says it once; a "0 items found" line above it used to say it twice.
      await h.gone('items-count');
      const none = await t('items-screen').first().innerText();
      assert.ok(none.includes('No results for “zzzz”') && none.includes('Try a brand, a model or a serial number.'), 'the empty search state is wrong');
      await h.shot('23-items-no-match');
      await h.fill('items-search', '');
      await h.tap('filter-no-value');
      await h.expectText('items-count', '1 item found');
      await h.tap('filter-no-photo');
      await h.expectText('items-count', '1 item found');
      await h.tap('filter-no-serial');
      await h.expectText('items-count', '3 items found');
      await h.shot('24-items-filtered');
      await h.tap('filter-all');
      await h.tap('items-sort');
      await h.shot('25-sort-sheet');
      await h.choose('Most valuable first');
      const first = await t('items-screen').first().innerText();
      assert.ok(first.indexOf('Grandmother') < first.indexOf('OLED'), 'not sorted by value');
      await h.tab('Rooms');
      await h.tap('gap-no-value');
      await h.visible('items-screen');
      await h.expectText('items-count', '1 item found');
      await h.tap('filter-all');
      await h.tab('Rooms');
    });

    await step('delete an item: its total goes, the rest stays', async () => {
      await h.openRoom('Kitchen');
      await h.tap('item-Stand mixer, 5 qt');
      await h.tap('item-delete');
      assert.match(await h.dialogText(), /Delete Stand mixer, 5 qt\?/);
      await h.cancel();
      await h.visible('item-screen');
      await h.tap('item-delete');
      await h.confirm();
      await h.visible('room-screen');
      await h.expectText('room-summary', '1 item · $2,400');
      await h.back();
      await h.expectText('home-total', '$6,648');
      await h.expectText('home-count', '5 items in 4 rooms');
    });

    await step('report: opens with every item, photo and receipt; the spreadsheet matches', async () => {
      await h.tab('Report');
      await h.fill('profile-home', 'Fern Cottage');
      // Typed a key at a time, as on a phone: the saved copy is trimmed on every key, and the field must not lose the spaces.
      // (Brought into view and left to settle first: in a browser, the page scrolling under a field takes the keyboard away.)
      await t('profile-owner').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await t('profile-owner').first().click();
      await page.waitForTimeout(300);
      await t('profile-owner').first().pressSequentially('Sample household', { delay: 20 });
      assert.strictEqual(await t('profile-owner').first().inputValue(), 'Sample household', 'a space typed into the name was swallowed');
      await h.fill('profile-address', '3 Fern Road, Elm Hill');
      await h.fill('profile-insurer', 'Example Mutual');
      await h.fill('profile-policy', 'HO-0000000');
      await h.shot('26-report');
      await h.shot('26b-report-full', { fullPage: true });
      const [reportPage] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(reportPage, 'report');
      await reportPage.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
      const text = await reportPage.evaluate(() => document.body.innerText);
      for (const s of ['Fern Cottage', 'Sample household', '3 Fern Road, Elm Hill', 'Example Mutual', 'HO-0000000', '$6,648.00', '65-inch OLED television', 'NV65A2X0418K', 'Three-seat sofa', 'No value', 'Receipts', 'Paid $1,799.99']) {
        assert.ok(text.includes(s), `the report is missing "${s}"`);
      }
      const images = await reportPage.evaluate(() => Array.from(document.images).map((i) => ({ ok: i.complete && i.naturalWidth > 0, data: i.src.startsWith('data:image/jpeg') })));
      assert.strictEqual(images.length, 5, `expected 4 item photos and 1 receipt, found ${images.length}`);
      assert.ok(images.every((i) => i.ok && i.data), 'a report image did not load');
      await reportPage.setViewportSize({ width: 816, height: 1056 });
      await reportPage.emulateMedia({ media: 'print' });
      await reportPage.screenshot({ path: path.join(SHOTS, '27-report-page.png'), fullPage: true });
      await reportPage.pdf({ path: path.join(SHOTS, 'report.pdf'), format: 'Letter', printBackground: true });
      await reportPage.close();

      // Without photos or receipts.
      await h.tap('opt-photos');
      await h.tap('opt-receipts');
      const [plain] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(plain, 'report-plain');
      await plain.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
      assert.strictEqual(await plain.evaluate(() => document.images.length), 0, 'photos were left in');
      await plain.close();
      await h.tap('opt-photos');
      await h.tap('opt-receipts');

      const [download] = await Promise.all([page.waitForEvent('download'), h.tap('make-csv')]);
      assert.match(download.suggestedFilename(), /^Fern-Cottage-\d{4}-\d{2}-\d{2}\.csv$/);
      const csv = fs.readFileSync(await download.path(), 'utf8');
      const rows = csv.replace('﻿', '').trimEnd().split('\r\n');
      assert.strictEqual(rows.length, 6, `expected a header and 5 items, got ${rows.length} rows`);
      assert.ok(csv.includes('Living room,65-inch OLED television,Electronics,1,Norvik,OL65-A2,NV65A2X0418K,1899.00,1899.00,1799.99,2021-03-04,Brightway Electronics'));
    });

    await step('backup: one file with the document and every photo', async () => {
      // The Rooms tab says so too, and its note leads to the backup section.
      await h.tab('Rooms');
      await h.expectText('gap-backup', /Not backed up/);
      await h.shot('27b-rooms-not-backed-up');
      await h.tap('gap-backup');
      await h.visible('report-screen');
      await page.waitForTimeout(900);
      const inView = await t('backup-now').first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      assert.ok(inView, 'the note on the Rooms tab did not bring the backup section into view');
      await h.expectText('last-backup', 'Not backed up yet.');
      const [download] = await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
      assert.match(download.suggestedFilename(), /^Plainproof-backup-\d{4}-\d{2}-\d{2}\.zip$/);
      backupZip = path.join(SHOTS, download.suggestedFilename());
      await download.saveAs(backupZip);
      const files = unzipSync(new Uint8Array(fs.readFileSync(backupZip)));
      const names = Object.keys(files).sort();
      const manifest = JSON.parse(strFromU8(files['plainproof.json']));
      assert.strictEqual(manifest.format, 'plainproof-backup');
      // A backup holds every place; there is one here, with the five items.
      assert.strictEqual(manifest.formatVersion, 2);
      assert.strictEqual(manifest.library.places.length, 1);
      assert.strictEqual(manifest.library.places[0].doc.items.length, 5);
      assert.strictEqual(names.filter((n) => /^photos\/[a-z0-9]+\.jpg$/.test(n)).length, 6, names.join(', '));
      assert.strictEqual(names.filter((n) => /_t\.jpg$/.test(n)).length, 6);
      assert.ok(!JSON.stringify(manifest).includes('pretend'), 'the backup carries Pro state');
      await h.expectText('last-backup', 'Last backed up today.');
      await h.shot('28-report-backed-up');
      await h.tab('Rooms');
      await h.gone('gap-backup');
      await h.tab('Report');
    });

    await step('the inventory survives a reload, and deep links open', async () => {
      await page.reload();
      await h.visible('report-screen');
      await h.tab('Rooms');
      await h.expectText('home-total', '$6,648');
      await page.goto(`${url}item/${firstItemId}`);
      await h.expectText('item-title', '65-inch OLED television');
      await page.goto(`${url}?p=/items`);
      await h.visible('items-screen');
      await page.goto(`${url}item/doesnotexist`);
      await assert.doesNotReject(page.getByText('This item is gone').waitFor({ timeout: 8000 }));
      await h.shot('29-item-gone');
      await page.goto(`${url}nowhere/at/all`);
      await assert.doesNotReject(page.getByText('That page isn’t here').waitFor({ timeout: 8000 }));
      await page.goto(url);
      await h.visible('rooms-screen');
    });

    await step('erase everything, then restore the backup', async () => {
      await h.tab('Settings');
      await h.tap('erase-everything');
      assert.match(await h.dialogText(), /Erase everything\?/);
      await h.confirm();
      await h.visible('welcome-intro');
      await h.onboard(['Kitchen']);
      await h.expectText('home-count', '1 room ready to fill');
      await h.tab('Report');
      // A file that is not a backup is refused and changes nothing.
      await h.upload('restore', path.join(FIXTURES, 'sofa.jpg'));
      assert.match(await h.dialogText(), /That backup could not be restored/);
      await h.shot('30-restore-refused');
      await h.confirm();
      await h.upload('restore', backupZip);
      assert.match(await h.dialogText(), /The backup holds 5 items in 4 rooms\. This inventory is empty/);
      await h.shot('31-restore-confirm');
      await h.confirm();
      assert.match(await h.dialogText(), /Backup restored 5 items in 4 rooms, with 6 photos\./);
      await h.confirm();
      await h.tab('Rooms');
      await h.expectText('home-total', '$6,648');
      await h.expectText('home-count', '5 items in 4 rooms');
      await h.openRoom('Living room');
      await h.tap('item-65-inch OLED television');
      await h.expectText('fact-serial', 'NV65A2X0418K');
      const photoOk = await page.evaluate(() => Array.from(document.images).some((i) => i.src.startsWith('data:image/jpeg') && i.naturalWidth > 400));
      assert.ok(photoOk, 'the restored photo is not showing');
      await h.back();
      await h.back();
    });

    await step('the free limit: full at 20, Pro unlocks it, nothing is held hostage', async () => {
      // 5 items so far; add 15 more to reach the limit exactly.
      await h.tap('add-item');
      for (let i = 6; i <= 20; i++) {
        await h.quickAdd(`Box of books no. ${i}`, '40');
        await h.tap('form-save-another');
        if (i < 20) await h.expectText('field-name', '');
      }
      await h.visible('rooms-screen'); // the 20th save closes the form: there is no room for another
      await h.expectText('home-count', '20 items in 4 rooms');
      await h.expectText('free-note', /The free version is full at 20 items\./);
      await h.tap('add-item');
      await h.visible('pro-screen');
      await h.expectText('pro-status', /holds 20 items, and yours is full\. Everything you have added stays/);
      await h.shot('32-pro-locked');
      // No store in this build: the button says so when tapped, and nothing is unlocked.
      await h.tap('pro-buy');
      assert.match(await h.dialogText(), /Purchases aren’t switched on in this build/);
      await h.confirm();
      await h.tap('pro-restore');
      assert.match(await h.dialogText(), /There is nothing to restore here/);
      await h.confirm();
      await h.expectText('pro-status', /yours is full/);
      await h.tap('pro-close');
      await h.gone('pro-screen');
      // Everything else still works at the limit: editing, the report, backups.
      await h.openRoom('Living room');
      await h.tap('room-add');
      await h.visible('pro-screen');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      await h.back();
      await h.tab('Settings');
      await h.expectText('pro-row', /20 of 20 free items used/);
      await h.tap('restore-purchase');
      assert.match(await h.dialogText(), /Purchases aren’t switched on in this build/);
      await h.confirm();
      await h.tap('dev-pretend-pro');
      await h.expectText('pro-row', /Unlocked\. No item limit\./);
      await h.tap('pro-row');
      await h.expectText('pro-status', /Add as many items as you like/);
      await h.shot('33-pro-unlocked');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      await h.tab('Rooms');
      assert.strictEqual(await t('free-note').count(), 0);
      await h.tap('add-item');
      await h.quickAdd('The 21st thing', '10');
      await h.tap('form-save');
      await h.expectText('home-count', '21 items in 4 rooms');
      // Pro off again: the 21 items stay, adding stops.
      await h.tab('Settings');
      await h.tap('dev-pretend-pro');
      await h.tab('Rooms');
      await h.expectText('home-count', '21 items in 4 rooms');
      await h.tap('add-item');
      await h.visible('pro-screen');
      await h.tap('pro-close');
      await h.gone('pro-screen');
    });

    await step('free and full: everything but adding still works, deleting makes room, a bigger backup comes back whole', async () => {
      // 21 items, Pro off. This is what a person who never pays is left with.
      await h.expectText('home-count', '21 items in 4 rooms');
      // The restore counted as a backup; the sixteen things added since have put it behind.
      await h.expectText('gap-backup', /Backup out of date/);
      // Editing, and adding a photo to something already there.
      await h.openRoom('Living room');
      await h.tap('item-65-inch OLED television');
      await h.tap('item-edit');
      await h.visible('item-form');
      await h.fill('field-value', '2000');
      await h.upload('photos-add', path.join(FIXTURES, 'lamp.jpg'));
      await h.visible('photos-remove-1', 15000);
      await h.tap('form-save');
      await h.expectText('item-value', '$2,000');
      await h.back();
      await h.back();
      // Rooms are never counted.
      await h.tap('add-room');
      await h.answer('Attic');
      await h.visible('room-Attic');
      await h.expectText('home-count', '21 items in 5 rooms');
      // The report, the spreadsheet and the backup carry all of it.
      await h.tab('Report');
      const [fullReport] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(fullReport, 'report-free-full');
      await fullReport.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
      const fullText = await fullReport.evaluate(() => document.body.innerText);
      for (const s of ['The 21st thing', 'Box of books no. 20', '65-inch OLED television', '$2,000.00']) {
        assert.ok(fullText.includes(s), `the free report is missing "${s}"`);
      }
      await fullReport.close();
      const [sheet] = await Promise.all([page.waitForEvent('download'), h.tap('make-csv')]);
      const sheetRows = fs.readFileSync(await sheet.path(), 'utf8').trimEnd().split('\r\n');
      assert.strictEqual(sheetRows.length, 22, `expected a header and 21 items, got ${sheetRows.length} rows`);
      const [fullDownload] = await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
      const fullZip = path.join(SHOTS, 'free-full-backup.zip');
      await fullDownload.saveAs(fullZip);
      const fullManifest = JSON.parse(strFromU8(unzipSync(new Uint8Array(fs.readFileSync(fullZip)))['plainproof.json']));
      assert.strictEqual(fullManifest.library.places[0].doc.items.length, 21);
      await h.tab('Rooms');
      await h.gone('gap-backup');
      // Deleting makes room: 21 down to 19, one more fits, then it is full again.
      await h.tab('Items');
      for (const name of ['The 21st thing', 'Box of books no. 20']) {
        await h.fill('items-search', name);
        await h.tap(`item-${name}`);
        await h.tap('item-delete');
        await h.confirm();
        await h.visible('items-screen');
      }
      await h.fill('items-search', '');
      await h.expectText('items-count', '19 items');
      await h.tap('items-add');
      await h.quickAdd('Back under the limit', '5');
      await h.tap('form-save');
      await h.visible('items-screen');
      await h.expectText('items-count', '20 items');
      await h.tap('items-add');
      await h.visible('pro-screen');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      // A backup bigger than the free version restores whole on a phone that has not paid.
      await h.tab('Settings');
      await h.tap('erase-everything');
      await h.confirm();
      await h.onboard(['Kitchen']);
      await h.tab('Report');
      await h.upload('restore', fullZip);
      assert.match(await h.dialogText(), /The backup holds 21 items in 5 rooms/);
      await h.confirm();
      assert.match(await h.dialogText(), /Backup restored 21 items in 5 rooms, with \d+ photos\./);
      await h.confirm();
      await h.tab('Rooms');
      await h.expectText('home-count', '21 items in 5 rooms');
      await h.expectText('free-note', /The free version is full at 20 items\./);
      await h.gone('gap-backup'); // what was just restored is what the file holds
      await h.shot('33b-free-full-restored');
      await h.openRoom('Living room');
      await h.tap('item-65-inch OLED television');
      await h.expectText('item-value', '$2,000');
      await h.tap('item-edit');
      await h.visible('item-form');
      await h.tap('form-cancel');
      await h.visible('item-screen');
      await h.back();
      await h.back();
      await h.tap('add-item');
      await h.visible('pro-screen');
      await h.tap('pro-close');
      await h.gone('pro-screen');
    });

    await step('sample home: 48 items, gaps listed, currency change', async () => {
      await h.tab('Settings');
      await h.tap('dev-sample');
      assert.match(await h.dialogText(), /Replace your inventory with the sample\?/);
      await h.confirm();
      assert.match(await h.dialogText(), /Sample home loaded/);
      await h.confirm();
      await h.tap('currency');
      await h.choose('British pound (GBP)');
      await h.tab('Rooms');
      await h.expectText('home-total', /^£[\d,]+$/);
      await h.tab('Settings');
      await h.tap('currency');
      await h.choose('US dollar (USD)');
      await h.tab('Rooms');
      await h.expectText('home-total', /^\$[\d,]+$/);
      await h.shot('34-rooms-sample');
      await h.shot('34b-rooms-sample-full', { fullPage: true });
      // Sliding through the drawer. All eight folders are in view; the opening moves down the column, one folder a step.
      const deck = t('room-deck').first();
      const eight = ['Living room', 'Kitchen', 'Bedroom', 'Home office', 'Garage', 'Laundry', 'Dining room', 'Bathroom'];
      const step = await h.deckStep();
      const tabY = async (room) => (await t(`room-tab-${room}`).first().boundingBox()).y;
      const slideTo = async (y) => {
        await deck.evaluate((el, top) => {
          el.scrollTop = top;
        }, y);
        await page.waitForTimeout(250);
      };
      const window_ = await deck.boundingBox();
      for (const room of eight) {
        const y = await tabY(room);
        assert.ok(y >= window_.y - 1 && y + 20 <= window_.y + window_.height, `${room} is not in view in the drawer`);
      }
      const rest = {};
      for (const room of eight) rest[room] = await tabY(room);
      assert.ok(await h.isOpen('Living room'), 'the first folder is not open to begin with');
      // Halfway to the second folder: the first is closing, the second has come halfway up, the rest have not moved yet.
      await slideTo(step / 2);
      const mid = await tabY('Kitchen');
      assert.ok(mid < rest['Kitchen'] - 20 && mid > rest['Living room'] + step - 1, `the second folder is not on its way up (${mid}, was ${rest['Kitchen']})`);
      assert.ok(Math.abs((await tabY('Bedroom')) - rest['Bedroom']) < 1, 'a folder further down moved too soon');
      await h.shot('34c-rooms-sliding');
      // Two folders on: the third is open. The folders above it have closed up; the ones below are where they were.
      await slideTo(2 * step);
      assert.ok(await h.isOpen('Bedroom'), 'the third folder did not open');
      assert.ok(!(await h.isOpen('Living room')) && !(await h.isOpen('Kitchen')), 'a folder that was passed is still open');
      assert.ok(Math.abs((await tabY('Living room')) - rest['Living room']) < 1, 'the first folder moved');
      assert.ok(Math.abs((await tabY('Bedroom')) - (rest['Living room'] + 2 * step)) < 1.5, 'the third folder is not two steps under the first');
      assert.ok(Math.abs((await tabY('Home office')) - rest['Home office']) < 1, 'the folder under the open one moved');
      await h.shot('34d-rooms-third-open');
      // Tapping the open folder goes into its room; coming back, the drawer is as it was left.
      await h.tap('room-Bedroom');
      await h.visible('room-screen');
      await h.expectText('room-title', 'Bedroom');
      await h.back();
      await h.visible('rooms-screen');
      assert.ok(await h.isOpen('Bedroom'), 'the drawer lost its place');
      // Tapping the tab of a closed folder brings the opening to it, and a second tap goes in.
      await t('room-tab-Garage').first().click();
      const deadline = Date.now() + 4000;
      while (!(await h.isOpen('Garage'))) {
        assert.ok(Date.now() < deadline, 'tapping a closed folder did not open it');
        await page.waitForTimeout(100);
      }
      assert.strictEqual(await t('room-screen').count(), 0, 'one tap on a closed folder went straight into the room');
      await page.waitForTimeout(300);
      await h.tap('room-Garage');
      await h.visible('room-screen');
      await h.expectText('room-title', 'Garage');
      await h.back();
      await h.visible('rooms-screen');
      // To the very last folder, and back to the start.
      await slideTo(7 * step);
      assert.ok(await h.isOpen('Bathroom'), 'the last folder does not open');
      await slideTo(0);
      assert.ok(await h.isOpen('Living room'), 'the first folder did not open again');
      for (const room of eight) assert.ok(Math.abs((await tabY(room)) - rest[room]) < 1, `${room} did not go back where it was`);
    });

    await step('places: a second cabinet needs Pro, keeps to itself, and can be removed', async () => {
      await h.tab('Rooms');
      await h.tap('places');
      await h.visible('places-screen');
      await h.visible('place-14 Alder Lane');
      await h.expectText('place-sum-14 Alder Lane', /^\$[\d,]+ · 4\d items$/);
      // The free version keeps one place: the tile says Pro, and tapping it opens the Pro screen.
      await h.visible('place-add-pro');
      await h.shot('38-places-one');
      await h.tap('place-add');
      await h.visible('pro-screen');
      assert.ok((await t('pro-screen').first().innerText()).includes('More than one place'), 'the Pro screen does not mention places');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      await h.tap('places-close');
      await h.gone('places-screen');
      await h.tab('Settings');
      await h.tap('dev-pretend-pro');
      await h.tab('Rooms');
      await h.tap('places');
      await h.visible('places-screen');
      assert.strictEqual(await t('place-add-pro').count(), 0, 'Pro is on but the tile still says Pro');
      // A new place: a name, a kind, and it opens with a few rooms of its own.
      await h.tap('place-add');
      await h.answer('Lake cabin');
      await h.choose('Rental property');
      await h.gone('places-screen');
      await h.visible('rooms-screen');
      await h.expectText('folder-label', /^lake cabin$/i);
      await h.expectText('home-count', '4 rooms ready to fill');
      for (const room of ['Living room', 'Kitchen', 'Bedroom', 'Bathroom']) await h.visible(`room-${room}`);
      assert.strictEqual(await t('room-Garage').count(), 0, 'a room of the first place shows in the second');
      await h.shot('39-rooms-second-place');
      await h.tap('add-item');
      await h.quickAdd('Canoe', '900');
      await h.tap('form-save');
      await h.visible('rooms-screen');
      await h.expectText('home-total', '$900');
      await h.expectText('home-count', '1 item in 4 rooms');
      // The report is this place's own, and with more than one place the Report tab says which.
      await h.tab('Report');
      await h.expectText('report-place', /This report is for Lake cabin only\. Each place has its own\./);
      // The name, address, insurer and policy are this place's own; the owner's name is the same everywhere.
      assert.strictEqual(await t('profile-home').first().inputValue(), 'Lake cabin');
      assert.strictEqual(await t('profile-insurer').first().inputValue(), '', 'the second place took the first place’s insurer');
      assert.strictEqual(await t('profile-owner').first().inputValue(), 'Sample household');
      await h.fill('profile-owner', 'The Marlows');
      await h.fill('profile-insurer', 'Lakeside Mutual');
      await h.tap('report-change-place');
      await h.visible('places-screen');
      await h.tap('places-close');
      await h.gone('places-screen');
      const [cabinReport] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(cabinReport, 'report-second-place');
      await cabinReport.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
      const cabinText = await cabinReport.evaluate(() => document.body.innerText);
      assert.ok(cabinText.includes('Lake cabin') && cabinText.includes('Canoe'), 'the second place’s report is missing its own things');
      assert.ok(!cabinText.includes('television') && !cabinText.includes('14 Alder Lane'), 'the second place’s report shows the first place');
      await cabinReport.close();
      await h.tab('Rooms');
      // Its things are its own: the Items tab and the search see the canoe and nothing from the first place.
      await h.tab('Items');
      await h.expectText('items-count', '1 item');
      await h.fill('items-search', 'television');
      await h.gone('items-count');
      await h.fill('items-search', '');
      await h.tab('Rooms');
      // The cabinets: each with its own total, the open one marked.
      await h.tap('places');
      await h.visible('places-screen');
      await h.expectText('place-sum-Lake cabin', '$900 · 1 item');
      await h.expectText('place-sum-14 Alder Lane', /^\$[\d,]+ · 4\d items$/);
      await h.visible('place-open-Lake cabin');
      assert.strictEqual(await t('place-open-14 Alder Lane').count(), 0, 'two places are marked as open');
      await h.shot('40-places-two');
      await h.tap('place-more-Lake cabin');
      await h.choose('Rename');
      await h.answer('The cabin');
      await h.visible('place-The cabin');
      assert.strictEqual(await t('place-Lake cabin').count(), 0);
      // Back to the first place: everything as it was left.
      await h.tap('place-14 Alder Lane');
      await h.gone('places-screen');
      await h.expectText('folder-label', /^14 alder lane$/i);
      await h.expectText('home-count', /^4\d items in 8 rooms$/);
      await h.tab('Report');
      assert.strictEqual(await t('profile-home').first().inputValue(), '14 Alder Lane');
      assert.strictEqual(await t('profile-insurer').first().inputValue(), 'Example Mutual', 'the first place lost its own insurer');
      assert.strictEqual(await t('profile-owner').first().inputValue(), 'The Marlows', 'the owner’s name did not follow to the other place');
      await h.tab('Rooms');
      await h.visible('room-Garage');
      // Remove the second place. The last one can't be removed: its menu has no such choice.
      await h.tap('places');
      await h.tap('place-more-The cabin');
      await h.choose('Delete this place');
      assert.match(await h.dialogText(), /Delete The cabin\?.*Its 1 item and their photos will be deleted/);
      await h.confirm();
      await h.gone('place-The cabin');
      await h.tap('place-more-14 Alder Lane');
      assert.ok(!(await h.dialogText()).includes('Delete this place'), 'the last place can be deleted');
      await h.cancel();
      await h.tap('places-close');
      await h.gone('places-screen');
      // One place again: the Report tab has nothing to tell apart.
      await h.tab('Report');
      assert.strictEqual(await t('report-place').count(), 0, 'the Report tab still names a place when there is only one');
      await h.tab('Settings');
      await h.tap('dev-pretend-pro');
      await h.tab('Rooms');
      await h.visible('free-note');
    });

    await step('a very large home: 650 items stay usable', async () => {
      await h.tab('Settings');
      await h.tap('dev-pretend-pro');
      await h.tap('dev-heavy');
      await h.confirm();
      assert.match(await h.dialogText(), /Sample home loaded 64\d items in 8 rooms/);
      await h.confirm();
      let t0 = Date.now();
      await h.tab('Items');
      await h.visible('items-search');
      timings.itemsTabMs = Date.now() - t0;
      await h.shot('35-items-heavy');
      t0 = Date.now();
      await h.fill('items-search', 'guitar');
      await h.expectText('items-count', /^\d+ items found$/);
      timings.searchMs = Date.now() - t0;
      await h.fill('items-search', '');
      await t('items-screen').first().evaluate((el) => el.scrollTo(0, 60000));
      await page.waitForTimeout(600);
      await h.shot('36-items-heavy-scrolled');
      await h.tab('Rooms');
      await h.shot('37-rooms-heavy');
      await h.tab('Report');
      t0 = Date.now();
      const [reportPage] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(reportPage, 'report-heavy');
      await reportPage.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 60000 });
      timings.heavyReportMs = Date.now() - t0;
      const rowCount = await reportPage.evaluate(() => document.querySelectorAll('table.list tbody tr').length);
      assert.ok(rowCount > 650, `only ${rowCount} rows in the large report`);
      await reportPage.close();
      t0 = Date.now();
      const [download] = await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
      timings.heavyBackupMs = Date.now() - t0;
      const files = unzipSync(new Uint8Array(fs.readFileSync(await download.path())));
      assert.ok(JSON.parse(strFromU8(files['plainproof.json'])).library.places[0].doc.items.length > 640);
      assert.ok(timings.itemsTabMs < 4000 && timings.searchMs < 4000 && timings.heavyReportMs < 20000, JSON.stringify(timings));
    });

    await context.close();

    // Dark mode and the other phone sizes start from the backup made earlier.
    const variants = [
      { label: 'dark', dark: true, viewport: PHONE },
      { label: 'small', viewport: { width: 375, height: 667 } },
      { label: 'large', viewport: { width: 430, height: 932 } },
    ];
    for (const v of variants) {
      await step(`${v.label} phone: restore the backup and look at every main screen`, async () => {
        const { context: ctx, page: p } = await newPhone(browser, v);
        const k = helpers(p);
        await p.goto(url);
        await k.visible('welcome-intro');
        await k.welcomeFits(); // the picture, the headline and the button all fit, even on a small phone
        await k.shot(`${v.label}-01-welcome`);
        await k.onboard(['Kitchen']);
        await k.tab('Report');
        await k.upload('restore', backupZip);
        await k.confirm();
        await k.confirm();
        await k.tab('Rooms');
        await k.expectText('home-total', '$6,648');
        // On every size the whole Rooms screen fits, and every folder of this small home is on it, above the row under the drawer.
        const roomsOverflow = await k.t('rooms-screen').first().evaluate((el) => el.scrollHeight - el.clientHeight);
        assert.ok(roomsOverflow <= 1, `the Rooms screen overflows by ${roomsOverflow} on the ${v.label} phone`);
        const note = await k.t('add-room').first().boundingBox();
        for (const room of ['Living room', 'Kitchen', 'Bedroom', 'Home office']) {
          const tab = await k.t(`room-tab-${room}`).first().boundingBox();
          assert.ok(tab.y > 0 && tab.y + tab.height < note.y, `${room} is not on the screen on the ${v.label} phone`);
        }
        assert.ok(note.y + note.height <= p.viewportSize().height - 80, `the row under the drawer is under the tab bar on the ${v.label} phone`);
        await k.shot(`${v.label}-02-rooms`);
        await k.openRoom('Living room');
        await k.shot(`${v.label}-03-room`);
        await k.tap('item-65-inch OLED television');
        await k.visible('item-screen');
        await k.shot(`${v.label}-04-item`);
        await k.tap('item-edit');
        await k.visible('item-form');
        await k.shot(`${v.label}-05-form`);
        await k.tap('form-cancel');
        await k.back();
        await k.back();
        await k.tab('Items');
        await k.shot(`${v.label}-06-items`);
        await k.tab('Report');
        await k.shot(`${v.label}-07-report`);
        await k.tab('Settings');
        await k.shot(`${v.label}-08-settings`);
        await k.tap('pro-row');
        await k.visible('pro-screen');
        await k.shot(`${v.label}-09-pro`);
        // Nothing may spill sideways at this size.
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `the page is ${overflow}px wider than the screen`);
        await ctx.close();
      });
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\nTimings: ${JSON.stringify(timings)}`);
  console.log(`Screenshots: ${SHOTS}`);
  console.log(`Base path: ${BASE}, total ${Math.round((Date.now() - started) / 1000)} s`);
}

// The store screenshots (e2e/store-shots.cjs) drive the app with the same hands.
module.exports = { helpers, newPhone, FIXTURES, PHONE, UA };

if (require.main === module) main()
  .catch(() => {})
  .finally(() => {
    if (problems.length > 0) {
      console.log(`\n${problems.length} problem(s):`);
      for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
      process.exit(1);
    }
    console.log(`\nAll ${stepCount} steps passed with no console errors.`);
  });
