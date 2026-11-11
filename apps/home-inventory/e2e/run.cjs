// Uses the app from end to end in a headless browser, the way a person would
// on a phone: first run, adding and editing things, the edge cases, the
// report, a backup and a restore, the free limit and Pro, and a very large
// home. It fails on any broken expectation and on any console error.
//
//   APP_BASE_URL=/game-studio/apps/home-inventory npx expo export --platform web
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
const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'roomfile-shots-'));
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
      await h.expectText('home-total', '$0');
      await h.expectText('home-count', '5 rooms ready to fill');
      await h.expectText('free-note', /Free version: 0 of 25 items used/);
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
      await h.shot('10-rooms-one-item');
    });

    await step('the room and the item show what was entered', async () => {
      await h.tap('room-Living room');
      await h.visible('room-screen');
      await h.expectText('room-summary', '1 item · $1,899');
      await h.shot('11-room');
      await h.tap('item-65-inch OLED television');
      await h.visible('item-screen');
      firstItemId = page.url().split('/item/')[1];
      await h.expectText('item-value', '$1,899.00');
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
      await h.shot('15-rooms-huge-value');
      // Put it back, and check that Cancel asks first.
      await h.tap('room-Living room');
      await h.tap('item-65-inch OLED television');
      await h.tap('item-edit');
      await h.fill('field-value', '1899');
      await h.tap('field-quantity-less');
      await h.tap('form-save');
      await h.expectText('item-value', '$1,899.00');
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
      await h.tap('room-Kitchen');
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
      await h.tap('room-Shed');
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
      await h.choose('Move up the list');
      await h.tap('room-menu');
      await h.choose('Delete room');
      assert.match(await h.dialogText(), /Delete Garden shed\?/);
      await h.confirm();
      await h.visible('rooms-screen');
      assert.strictEqual(await t('room-Garden shed').count(), 0);
      // A room with something in it asks where the things should go.
      await h.tap('room-Garage');
      await h.tap('room-menu');
      await h.choose('Delete room');
      assert.match(await h.dialogText(), /Garage has 1 item/);
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
      await h.expectText('items-count', '0 items found');
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
      await h.tap('room-Kitchen');
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
      await h.fill('profile-owner', 'Sample household');
      await h.fill('profile-insurer', 'Example Mutual');
      await h.fill('profile-policy', 'HO-0000000');
      await h.shot('26-report');
      await h.shot('26b-report-full', { fullPage: true });
      const [reportPage] = await Promise.all([context.waitForEvent('page'), h.tap('make-report')]);
      watch(reportPage, 'report');
      await reportPage.waitForFunction(() => document.body && document.body.innerText.includes('Summary by room'), null, { timeout: 20000 });
      const text = await reportPage.evaluate(() => document.body.innerText);
      for (const s of ['Fern Cottage', 'Sample household', 'Example Mutual', 'HO-0000000', '$6,648.00', '65-inch OLED television', 'NV65A2X0418K', 'Three-seat sofa', 'Not valued', 'Receipts', 'Paid $1,799.99']) {
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
      await h.expectText('last-backup', 'Not backed up yet.');
      const [download] = await Promise.all([page.waitForEvent('download'), h.tap('backup-now')]);
      assert.match(download.suggestedFilename(), /^Roomfile-backup-\d{4}-\d{2}-\d{2}\.zip$/);
      backupZip = path.join(SHOTS, download.suggestedFilename());
      await download.saveAs(backupZip);
      const files = unzipSync(new Uint8Array(fs.readFileSync(backupZip)));
      const names = Object.keys(files).sort();
      const manifest = JSON.parse(strFromU8(files['roomfile.json']));
      assert.strictEqual(manifest.format, 'roomfile-backup');
      assert.strictEqual(manifest.doc.items.length, 5);
      assert.strictEqual(names.filter((n) => /^photos\/[a-z0-9]+\.jpg$/.test(n)).length, 6, names.join(', '));
      assert.strictEqual(names.filter((n) => /_t\.jpg$/.test(n)).length, 6);
      assert.ok(!JSON.stringify(manifest).includes('pretend'), 'the backup carries Pro state');
      await h.expectText('last-backup', 'Last backed up today.');
      await h.shot('28-report-backed-up');
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
      await h.tap('dev-erase');
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
      await h.tap('room-Living room');
      await h.tap('item-65-inch OLED television');
      await h.expectText('fact-serial', 'NV65A2X0418K');
      const photoOk = await page.evaluate(() => Array.from(document.images).some((i) => i.src.startsWith('data:image/jpeg') && i.naturalWidth > 400));
      assert.ok(photoOk, 'the restored photo is not showing');
      await h.back();
      await h.back();
    });

    await step('the free limit: full at 25, Pro unlocks it, nothing is held hostage', async () => {
      // 5 items so far; add 20 more to reach the limit exactly.
      await h.tap('add-item');
      for (let i = 6; i <= 25; i++) {
        await h.quickAdd(`Box of books no. ${i}`, '40');
        await h.tap('form-save-another');
        if (i < 25) await h.expectText('field-name', '');
      }
      await h.visible('rooms-screen'); // the 25th save closes the form: there is no room for another
      await h.expectText('home-count', '25 items in 4 rooms');
      await h.expectText('free-note', /The free version is full at 25 items\./);
      await h.tap('add-item');
      await h.visible('pro-screen');
      await h.expectText('pro-status', /holds 25 items, and yours is full\. Everything you have added stays/);
      assert.ok(await t('pro-buy').first().isDisabled(), 'the buy button should be off without a store');
      await h.shot('32-pro-locked');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      // Everything else still works at the limit: editing, the report, backups.
      await h.tap('room-Living room');
      await h.tap('room-add');
      await h.visible('pro-screen');
      await h.tap('pro-close');
      await h.gone('pro-screen');
      await h.back();
      await h.tab('Settings');
      await h.expectText('pro-row', /25 of 25 free items used/);
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
      await h.quickAdd('The 26th thing', '10');
      await h.tap('form-save');
      await h.expectText('home-count', '26 items in 4 rooms');
      // Pro off again: the 26 items stay, adding stops.
      await h.tab('Settings');
      await h.tap('dev-pretend-pro');
      await h.tab('Rooms');
      await h.expectText('home-count', '26 items in 4 rooms');
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
      assert.ok(JSON.parse(strFromU8(files['roomfile.json'])).doc.items.length > 640);
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
        await k.shot(`${v.label}-01-welcome`);
        await k.onboard(['Kitchen']);
        await k.tab('Report');
        await k.upload('restore', backupZip);
        await k.confirm();
        await k.confirm();
        await k.tab('Rooms');
        await k.expectText('home-total', '$6,648');
        await k.shot(`${v.label}-02-rooms`);
        await k.tap('room-Living room');
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

main()
  .catch(() => {})
  .finally(() => {
    if (problems.length > 0) {
      console.log(`\n${problems.length} problem(s):`);
      for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
      process.exit(1);
    }
    console.log(`\nAll ${stepCount} steps passed with no console errors.`);
  });
