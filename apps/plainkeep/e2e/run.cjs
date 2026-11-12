// Uses the app from end to end in a headless browser, the way a person would
// on a phone: first run, a home and a car, marking jobs done, the odometer,
// the log, reminders, the free limit and Pro, a backup and a restore, bad
// input, and a household far larger than any real one. It fails on any broken
// expectation and on any console error.
//
//   APP_BASE_URL=/game-studio/apps/plainkeep npx expo export --platform web
//   node e2e/run.cjs                # screenshots go to a temp folder
//   SHOTS_DIR=/some/folder node e2e/run.cjs
//
// Needs Playwright with Chromium (the studio workspace has both). The clock is
// fixed at 10:00 on 2026-11-12, so what the screens say does not depend on the
// day the run happens.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');

const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'plainkeep-shots-'));
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { width: 393, height: 852 };
const SMALL = { width: 320, height: 568 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const NOW = new Date('2026-11-12T10:00:00-06:00');

const problems = [];
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
    timezoneId: 'America/Chicago',
  });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
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
  // Screens stay mounted when hidden, so the same test id can exist twice: always act on the one a person can see.
  const t = (id) => page.getByTestId(id).filter({ visible: true });
  const h = {
    t,
    async shot(name, opts = {}) {
      await page.waitForTimeout(300);
      if (opts.tall) {
        const size = page.viewportSize();
        await page.setViewportSize({ width: size.width, height: opts.tall });
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
        await page.setViewportSize(size);
        return;
      }
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    },
    async tap(id) {
      await t(id).first().click();
      // These close a sheet; give it time to go before the next step leans on what is underneath.
      if (/^(pro-close|form-cancel|suggest-skip|suggest-add)$/.test(id)) await page.waitForTimeout(450);
    },
    async fill(id, text) {
      await t(id).first().fill(text);
    },
    async text(id) {
      return (await t(id).first().innerText()).trim();
    },
    async tab(name) {
      await page.getByRole('tab', { name }).filter({ visible: true }).click();
      await page.waitForTimeout(250);
    },
    async sees(text) {
      await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
    },
    async gone(id) {
      await assert.doesNotReject(page.getByTestId(id).filter({ visible: true }).first().waitFor({ state: 'detached', timeout: 4000 }).catch(async () => {
        assert.strictEqual(await t(id).count(), 0, `${id} is still on screen`);
      }));
    },
    async confirm() {
      await t('dialog-confirm').click();
      await page.waitForTimeout(200);
    },
    async choice(key) {
      await t(`choice-${key}`).click();
      await page.waitForTimeout(200);
    },
    async save() {
      await t('form-save').click();
      await page.waitForTimeout(450);
    },
    async back() {
      await page.goBack();
      await page.waitForTimeout(500);
    },
    /** The id-bearing rows on screen whose test id starts with a prefix. */
    rows(prefix) {
      return page.locator(`[data-testid^="${prefix}"]`).filter({ visible: true });
    },
    async jobId(name) {
      const row = page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: name }).first();
      return (await row.getAttribute('data-testid')).slice('job-'.length);
    },
    async openJob(name) {
      await page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: name }).first().click();
      await t('job-screen').waitFor();
    },
    async openThing(name) {
      await page.locator('[data-testid^="thing-"]').filter({ visible: true }).filter({ hasText: name }).first().click();
      await t('thing-screen').waitFor();
    },
    async loadSample(kind = 'dev-sample') {
      await h.tab('Settings');
      await h.tap(kind);
      // "Replace everything?" only when there is something to replace; then the "loaded" note.
      await page.waitForTimeout(300);
      if ((await page.getByText('Replace everything with the sample?').filter({ visible: true }).count()) > 0) await h.confirm();
      await h.sees('Sample household loaded');
      await h.confirm();
    },
    async pretendPro(on) {
      await h.tab('Settings');
      const sw = t('dev-pretend-pro').first();
      const box = sw.locator('input[type="checkbox"]');
      const isOn = (await box.count()) > 0 ? await box.first().isChecked() : (await sw.getAttribute('aria-checked')) === 'true';
      if (isOn !== on) await sw.click();
      await page.waitForTimeout(200);
    },
  };
  return h;
}

async function start(page, url) {
  await page.goto(url);
  await page.getByTestId('welcome-screen').or(page.getByTestId('due-screen')).filter({ visible: true }).first().waitFor({ timeout: 20000 });
}

async function main() {
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  let backupPath = null;

  try {
    // ---------------------------------------------------------------- first run
    const first = await newPhone(browser, { label: 'first run' });
    const page = first.page;
    const h = helpers(page);

    await step('a new phone starts at the welcome screen', async () => {
      await start(page, url);
      await h.sees('Know what’s due on the house and the car.');
      await h.shot('01-welcome');
    });

    await step('starting with a home: a name is asked for, the usual jobs are offered', async () => {
      await h.tap('welcome-home');
      await h.t('thing-form').waitFor();
      assert.strictEqual(await h.t('field-name').inputValue(), 'Home');
      await h.fill('field-name', '');
      await h.save();
      await h.t('error-name').waitFor();
      await h.shot('02-thing-form-error');
      await h.fill('field-name', 'Home');
      await h.fill('field-detail', 'Two floors, gas furnace');
      await h.shot('03-thing-form');
      await h.save();
      await h.t('suggestions').waitFor();
      await h.shot('04-suggestions', { tall: 1500 });
      // Six are ticked to begin with; take one off and add another.
      await h.sees('Add 6 jobs');
      await h.tap('suggest-gutters');
      await h.tap('suggest-water-heater');
      await h.tap('suggest-add');
      await h.t('thing-screen').waitFor();
      assert.strictEqual(await h.rows('job-').count(), 6);
      await h.shot('05-thing-home-new', { tall: 1500 });
    });

    await step('new jobs wait under "Not logged yet": no made-up countdown, just how often each comes round', async () => {
      await h.back();
      await h.t('due-screen').waitFor();
      await h.t('section-unlogged').waitFor();
      assert.strictEqual(await h.t('section-soon').count(), 0);
      const alarms = page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: 'Test smoke and CO alarms' }).first();
      assert.match(await alarms.innerText(), /Home\s+· Every month/);
      assert.doesNotMatch(await alarms.innerText(), /weeks|days/);
      await h.shot('06-due-new-home', { tall: 1300 });
    });

    await step('marking a job done on an earlier date moves it on from that date', async () => {
      const id = await h.jobId('Furnace filter');
      await h.tap(`punch-${id}`);
      await h.t('done-form').waitFor();
      assert.strictEqual(await h.text('done-title'), 'Furnace filter');
      await h.fill('field-date', '2026-10-01');
      await h.fill('field-cost', '18.99');
      await h.fill('field-note', '20 x 25 x 1, two-pack');
      await h.shot('07-done-form');
      await h.save();
      await h.openJob('Furnace filter');
      // Three months from Oct 1 is Jan 1: 50 days away, and in another year, so the year is shown.
      assert.strictEqual(await h.text('job-figure'), '7');
      assert.match(await h.text('job-ends'), /Due Jan 1, 2027/);
      assert.strictEqual(await h.text('job-repeat'), 'Every 3 months');
      await h.shot('08-job', { tall: 1300 });
    });

    await step('a job can be edited, put away, brought back, and skipped', async () => {
      await h.tap('job-edit');
      await h.t('job-form').waitFor();
      await h.fill('field-every-n', '2');
      await h.fill('field-note', 'Buy MERV 11');
      await h.shot('09-job-form', { tall: 1300 });
      await h.save();
      assert.strictEqual(await h.text('job-repeat'), 'Every 2 months');
      assert.match(await h.text('job-ends'), /Due Dec 1/);
      assert.strictEqual(await h.text('job-note'), 'Buy MERV 11');
      await h.tap('job-paused');
      await h.sees('Paused. No due dates or reminders until you bring it back.');
      await h.tap('job-paused');
      await h.tap('job-skip');
      await h.confirm();
      // Skipped today: two months from Nov 12.
      assert.match(await h.text('job-ends'), /Due Jan 12, 2027/);
      await h.sees('Skipped');
      await h.back();
    });

    await step('adding a car with its odometer, and a job that goes by distance and date', async () => {
      await h.tab('Things');
      await h.tap('add-thing');
      await h.t('thing-form').waitFor();
      await h.tap('kind-vehicle');
      await h.fill('field-name', 'Outback');
      await h.fill('field-detail', '2019 Subaru');
      await h.fill('field-odometer', '62418');
      await h.save();
      await h.t('suggestions').waitFor();
      for (const key of ['tire-rotation', 'registration', 'engine-air', 'cabin-air', 'wipers']) await h.tap(`suggest-${key}`);
      await h.sees('Add 1 job');
      await h.tap('suggest-add');
      await h.t('thing-screen').waitFor();
      assert.match(await h.text('thing-reading-note'), /Read Nov 12/);
      // Oil: every 5,000 mi or 6 months; never logged, so it says how often and counts nothing down.
      const oil = page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: 'Oil and filter change' }).first();
      assert.match(await oil.innerText(), /Every 5,000 mi or 6 months/);
      await h.shot('10-thing-car', { tall: 1300 });
    });

    await step('logging the oil change with a reading moves both limits and the odometer', async () => {
      const id = await h.jobId('Oil and filter change');
      await h.tap(`punch-${id}`);
      await h.t('done-form').waitFor();
      await h.fill('field-distance', '62500');
      await h.fill('field-cost', '74,95');
      await h.save();
      const oil = page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: 'Oil and filter change' }).first();
      // The line has room for one limit, the one its figure counts: the date, which comes first here.
      assert.match(await oil.innerText(), /May 12, 2027/);
      await h.openJob('Oil and filter change');
      assert.match(await h.text('job-ends'), /Due May 12, 2027 or 67,500 mi/);
      await h.back();
      assert.match(await h.t('thing-odometer').getAttribute('aria-label'), /62500/);
    });

    await step('the odometer form: a lower reading is questioned, a newer one sets the pace', async () => {
      await h.tap('thing-update-odometer');
      await h.t('odometer-form').waitFor();
      await h.save();
      await h.sees('Enter what the odometer says.');
      await h.fill('field-reading', '100');
      await h.save();
      await h.sees('Lower than the last reading');
      await h.tap('dialog-cancel');
      await h.fill('field-reading', '61000');
      await h.fill('field-date', '2026-10-01');
      await h.shot('11-odometer');
      await h.save();
      // 1,500 in 42 days is about 1,071 a month.
      assert.match(await h.text('thing-reading-note'), /About 1,071 mi a month/);
    });

    await step('a one-off repair goes in the log; the log searches, filters, edits and deletes', async () => {
      await h.tap('thing-log-other');
      await h.t('done-form').waitFor();
      await h.save();
      await h.t('error-title').waitFor();
      await h.fill('field-title', 'New front brake pads');
      await h.fill('field-cost', 'abc');
      await h.save();
      await h.sees('Enter an amount, like 74.95');
      await h.fill('field-cost', '412');
      await h.fill('field-distance', '62500');
      await h.save();
      await h.back();
      await h.tab('Log');
      await h.sees('New front brake pads');
      assert.strictEqual(await h.text('spent-2026'), '$505.94 spent');
      await h.shot('12-log', { tall: 1100 });
      await h.fill('log-search', 'brake');
      assert.strictEqual(await h.rows('entry-').count(), 1);
      await h.fill('log-search', 'zzz');
      await h.sees('No entries match “zzz”.');
      await h.tap('log-search-clear');
      const homeChip = page.locator('[data-testid^="filter-"]').filter({ visible: true }).filter({ hasText: 'Home' });
      await homeChip.click();
      assert.strictEqual(await h.rows('entry-').count(), 2);
      await h.tap('filter-all');
      await page.locator('[data-testid^="entry-"]').filter({ visible: true }).filter({ hasText: 'New front brake pads' }).click();
      await h.t('done-form').waitFor();
      await h.fill('field-title', 'New front brake pads and rotors');
      await h.fill('field-cost', '430');
      await h.save();
      await h.sees('New front brake pads and rotors');
      assert.strictEqual(await h.text('spent-2026'), '$523.94 spent');
      await page.locator('[data-testid^="entry-"]').filter({ visible: true }).filter({ hasText: 'Skipped' }).click();
      await h.tap('entry-delete');
      await h.confirm();
      assert.strictEqual(await page.getByText('Skipped').filter({ visible: true }).count(), 0);
    });

    await step('a job of my own: fixed to its date, with its own reminder', async () => {
      await h.tab('Due');
      await h.tap('add-job');
      await h.t('job-form').waitFor();
      await h.save();
      await h.t('error-name').waitFor();
      await h.fill('field-name', 'Property tax');
      await h.fill('field-every-n', '1');
      await h.tap('field-every-unit');
      await h.choice('year');
      await h.tap('field-fixed');
      await h.fill('field-first-due', '2026-12-31');
      await h.tap('field-lead');
      await h.choice('30');
      await h.shot('13-job-form-new', { tall: 1300 });
      await h.save();
      await h.openJob('Property tax');
      assert.strictEqual(await h.text('job-repeat'), 'Every year on December 31');
      await h.tap('job-done');
      await h.save();
      // Paid seven weeks early: the next one is the same date a year on.
      assert.match(await h.text('job-ends'), /Due Dec 31, 2027/);
      await h.back();
    });

    await step('reminders: off until asked for, then the plan can be read', async () => {
      await h.t('reminders-off').waitFor();
      await h.tap('reminders-turn-on');
      await h.gone('reminders-off');
      await h.tab('Settings');
      await h.shot('14-settings', { tall: 1900 });
      await h.tap('coming');
      await h.t('coming-screen').waitFor();
      await h.t('coming-web-note').waitFor();
      await h.sees('Each arrives at 9:00 AM.');
      await h.sees('if it isn’t done');
      await h.sees('jobs aren’t logged yet');
      assert.ok((await h.rows('planned-').count()) >= 10, 'expected a list of reminders');
      await h.shot('15-coming', { tall: 1500 });
      await h.back();
      await h.tap('lead');
      await h.choice('14');
      await h.fill('remind-time', '18:30');
      await h.tap('coming');
      await h.sees('Each arrives at 6:30 PM.');
      await h.back();
      await h.tap('reminders-switch');
      await h.tap('reminders-switch');
    });

    await step('the free version holds two things; nothing already there is locked', async () => {
      await h.tab('Things');
      await h.sees('The free version looks after 2 things');
      await h.shot('16-things-full');
      await h.tap('add-thing');
      await h.t('pro-screen').waitFor();
      assert.match(await h.text('pro-status'), /and you have 2\. Everything you have added stays/);
      await h.shot('17-pro');
      await h.tap('pro-buy');
      await h.sees('Purchases aren’t switched on in this build');
      await h.confirm();
      await h.tap('pro-restore');
      await h.confirm();
      await h.tap('pro-close');
      // Everything else still works at the limit: a new job, a log entry, the service record's door.
      await h.openThing('Home');
      await h.tap('thing-add-job');
      await h.fill('field-name', 'Check sump pump');
      await h.save();
      await h.sees('Check sump pump');
      await h.tap('thing-record');
      await h.t('pro-screen').waitFor();
      await h.tap('pro-close');
      await h.back();
    });

    await step('with Pro: a third thing, and the service record opens', async () => {
      await h.pretendPro(true);
      await h.sees('Unlocked. Look after as many things as you have.');
      await h.tab('Things');
      await h.tap('add-thing');
      await h.t('thing-form').waitFor();
      await h.tap('kind-other');
      await h.fill('field-name', 'Mower');
      await h.tap('icon-mower');
      await h.save();
      await h.tap('suggest-skip');
      await h.t('thing-screen').waitFor();
      await h.back();
      assert.strictEqual(await h.rows('thing-status-').count(), 3);
      await h.openThing('Outback');
      const [popup] = await Promise.all([page.waitForEvent('popup'), h.tap('thing-record')]);
      await popup.waitForLoadState();
      await popup.getByText('Service record').first().waitFor();
      const record = await popup.content();
      assert.ok(record.includes('<h1 class="plate">Outback</h1>'));
      assert.ok(record.includes('New front brake pads and rotors'));
      assert.ok(record.includes('$430.00'));
      assert.ok(!record.includes('Furnace filter'));
      await popup.setViewportSize({ width: 794, height: 1123 });
      await popup.screenshot({ path: path.join(SHOTS, '18-service-record.png') });
      await popup.close();
      await h.back();
    });

    await step('the log exports as a spreadsheet and everything backs up to one file', async () => {
      await h.tab('Settings');
      const [csv] = await Promise.all([page.waitForEvent('download'), h.tap('export-log')]);
      const csvText = fs.readFileSync(await csv.path(), 'utf8');
      assert.match(csv.suggestedFilename(), /^Plainkeep log 2026-11-12\.csv$/);
      assert.ok(csvText.includes('Date,For,What was done,Odometer (mi),Cost (USD),Note'));
      assert.ok(csvText.includes('2026-11-12,Outback,New front brake pads and rotors,62500,430.00,'));
      const [backup] = await Promise.all([page.waitForEvent('download'), h.tap('backup')]);
      assert.strictEqual(backup.suggestedFilename(), 'Plainkeep backup 2026-11-12.json');
      backupPath = path.join(SHOTS, 'backup.json');
      await backup.saveAs(backupPath);
      const file = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      assert.strictEqual(file.kind, 'plainkeep-backup');
      assert.strictEqual(file.doc.things.length, 3);
      assert.ok(!/pretend|owned/.test(fs.readFileSync(backupPath, 'utf8')));
    });

    await step('deleting: a job keeps its history, a thing takes everything with it', async () => {
      await h.tab('Things');
      await h.openThing('Outback');
      await h.openJob('Oil and filter change');
      await h.tap('job-edit');
      await h.t('job-form').waitFor();
      await h.tap('job-delete');
      await h.sees('What has been logged for it stays in the log.');
      await h.confirm();
      await page.waitForTimeout(500);
      await h.t('thing-screen').waitFor();
      assert.strictEqual(await page.locator('[data-testid^="job-"]').filter({ visible: true }).filter({ hasText: 'Oil and filter change' }).count(), 0);
      assert.ok((await page.locator('[data-testid^="entry-"]').filter({ visible: true }).filter({ hasText: 'Oil and filter change' }).count()) >= 1);
      await h.tap('thing-edit');
      await h.t('thing-form').waitFor();
      await h.tap('thing-delete');
      await h.sees('go with it');
      await h.confirm();
      await page.waitForTimeout(500);
      await h.t('things-screen').waitFor();
      assert.strictEqual(await h.rows('thing-status-').count(), 2);
      await h.tab('Log');
      assert.strictEqual(await page.getByText('New front brake pads and rotors').filter({ visible: true }).count(), 0);
    });

    await step('erase everything goes back to the start; a wrong file is refused; the backup restores it all', async () => {
      await h.tab('Settings');
      await h.tap('erase-everything');
      await h.confirm();
      await h.t('welcome-screen').waitFor();
      await h.tap('welcome-skip');
      await h.t('due-screen').waitFor();
      await h.sees('Nothing to keep up yet');
      await h.shot('19-due-empty');
      await h.tab('Things');
      await h.shot('20-things-empty');
      await h.tab('Log');
      await h.shot('21-log-empty');
      await h.tab('Settings');
      const wrong = path.join(SHOTS, 'not-a-backup.json');
      fs.writeFileSync(wrong, '{"hello":"there"}');
      let [chooser] = await Promise.all([page.waitForEvent('filechooser'), h.tap('restore')]);
      await chooser.setFiles(wrong);
      await h.sees('That isn’t a Plainkeep backup');
      await h.confirm();
      [chooser] = await Promise.all([page.waitForEvent('filechooser'), h.tap('restore')]);
      await chooser.setFiles(backupPath);
      await h.sees('The backup has 3 things');
      await h.confirm();
      await h.sees('Backup restored');
      await h.confirm();
      await h.tab('Things');
      assert.strictEqual(await h.rows('thing-status-').count(), 3);
      await h.tab('Log');
      await h.sees('New front brake pads and rotors');
      // Pro is this phone's, not the backup's: still on here.
      await h.tab('Settings');
      await h.sees('Unlocked.');
    });

    await step('a backup bigger than the free version restores whole on a phone that has not paid', async () => {
      await h.pretendPro(false);
      await h.tab('Things');
      assert.strictEqual(await h.rows('thing-status-').count(), 3);
      await h.openThing('Mower');
      await h.tap('thing-add-job');
      await h.fill('field-name', 'Sharpen blade');
      await h.save();
      await h.sees('Sharpen blade');
      await h.back();
      await h.tap('add-thing');
      await h.t('pro-screen').waitFor();
      await h.tap('pro-close');
    });

    await step('awkward input: very long names, huge numbers, nothing at all', async () => {
      await h.pretendPro(true);
      await h.tab('Things');
      await h.tap('add-thing');
      await h.tap('kind-vehicle');
      const long = 'The second-hand camper van with the very long name that somebody typed in full';
      await h.fill('field-name', long);
      await h.fill('field-odometer', '99999999');
      await h.save();
      await h.sees('That is more than an odometer shows.');
      await h.fill('field-odometer', '9999999');
      await h.save();
      await h.tap('suggest-add');
      await h.t('thing-screen').waitFor();
      assert.strictEqual((await h.text('thing-name')).length, 60);
      await h.tap('thing-add-job');
      await h.fill('field-name', 'Replace the left-hand rear suspension bush and check the other side too');
      await h.fill('field-every-n', '0');
      await h.save();
      await h.sees('Enter a number from 1 to 999.');
      await h.fill('field-every-n', '999');
      await h.tap('mode-both');
      await h.save();
      await h.sees('Enter a distance.');
      await h.fill('field-distance', '9999999');
      await h.save();
      await h.tap('thing-log-other');
      await h.fill('field-title', 'Engine rebuild');
      await h.fill('field-cost', '99999999999999');
      await h.save();
      await h.sees('That is more than the app can hold.');
      await h.fill('field-cost', '99999999.99');
      await h.save();
      await h.shot('22-long-names', { tall: 1500 });
      await h.back();
      await h.shot('23-things-long');
      await h.tab('Due');
      await h.shot('24-due-long', { tall: 1700 });
      await h.tab('Log');
      await h.sees('$100,000,523.93 spent');
      await h.shot('25-log-huge');
    });

    await first.context.close();

    // ---------------------------------------------------------------- the sample household, as the pictures
    const second = await newPhone(browser, { label: 'sample' });
    const p2 = second.page;
    const h2 = helpers(p2);

    await step('the sample household: every part of the Due list, and what the reminders would be', async () => {
      await start(p2, url);
      await h2.tap('welcome-skip');
      await h2.loadSample();
      await h2.tab('Due');
      await h2.t('section-overdue').waitFor();
      await h2.t('section-soon').waitFor();
      await h2.t('section-later').waitFor();
      await h2.shot('30-due', { tall: 2100 });
      await h2.shot('30-due-screen');
      await h2.tab('Things');
      await h2.shot('31-things', { tall: 1100 });
      await h2.openThing('Outback');
      await h2.shot('32-thing-car', { tall: 1900 });
      await h2.openJob('Oil and filter change');
      assert.strictEqual(await h2.text('job-figure'), '308');
      await h2.shot('33-job-overdue', { tall: 1200 });
      await h2.back();
      await h2.openJob('Registration renewal');
      await h2.shot('34-job-fixed', { tall: 1200 });
      await h2.back();
      await h2.back();
      await h2.openThing('Home');
      await h2.shot('35-thing-home', { tall: 1900 });
      await h2.back();
      await h2.tab('Log');
      await h2.shot('36-log', { tall: 2100 });
      await h2.tab('Settings');
      await h2.tap('reminders-switch');
      await h2.tap('coming');
      await h2.t('planned-0').waitFor();
      await h2.shot('37-coming', { tall: 2100 });
      await h2.back();
      await h2.tap('pro-row');
      await h2.shot('38-pro-free');
      await h2.tap('pro-close');
    });

    await step('units: kilometres and another currency change the labels everywhere', async () => {
      await h2.tab('Settings');
      await h2.tap('distance-unit-km');
      await h2.tap('currency');
      await h2.choice('GBP');
      await h2.tab('Things');
      await h2.sees('308 km overdue');
      await h2.tab('Log');
      await h2.sees('£');
      await h2.tab('Settings');
      await h2.tap('distance-unit-mi');
      await h2.tap('currency');
      await h2.choice('USD');
    });

    await step('reloading keeps everything, and a reloaded deep page comes back to itself', async () => {
      await p2.waitForTimeout(600);
      await p2.reload();
      await h2.t('settings-screen').waitFor({ timeout: 20000 });
      await h2.tab('Things');
      await h2.t('things-screen').waitFor();
      await h2.rows('thing-status-').first().waitFor();
      assert.strictEqual(await h2.rows('thing-status-').count(), 4);
      await p2.goto(`${url}?p=/thing/samplecar0000001`);
      await h2.t('thing-screen').waitFor({ timeout: 20000 });
      assert.strictEqual(await h2.text('thing-name'), 'Outback');
      await p2.goto(`${url}?p=/job/nothere`);
      await h2.sees('This job is no longer here');
    });

    await second.context.close();

    // ---------------------------------------------------------------- a household far too large
    const heavy = await newPhone(browser, { label: 'heavy' });
    const p3 = heavy.page;
    const h3 = helpers(p3);

    await step('40 things, 400 jobs and 4,000 log entries: restores, lists and scrolls', async () => {
      const things = [];
      const jobs = [];
      const entries = [];
      for (let i = 0; i < 40; i++) {
        const id = `thing${String(i).padStart(11, '0')}`;
        const vehicle = i % 2 === 1;
        things.push({ id, kind: vehicle ? 'vehicle' : 'home', icon: vehicle ? 'car' : 'house', name: `${vehicle ? 'Car' : 'House'} ${i + 1}`, detail: '', readings: vehicle ? [{ ymd: '2026-01-01', value: 20000 + i * 1000 }, { ymd: '2026-11-01', value: 30000 + i * 1000 }] : [], createdAt: 1 });
        for (let j = 0; j < 10; j++) {
          const jid = `job${String(i * 10 + j).padStart(13, '0')}`;
          jobs.push({ id: jid, thingId: id, name: `Job ${j + 1} of thing ${i + 1}`, note: '', every: { n: (j % 12) + 1, unit: 'month' }, everyDistance: vehicle && j % 3 === 0 ? 5000 : null, anchor: 'done', startYmd: '2026-12-01', startDistance: null, leadDays: null, paused: false, createdAt: 1 });
          for (let k = 0; k < 10; k++) {
            const month = String((k % 10) + 1).padStart(2, '0');
            entries.push({ id: `ent${String(entries.length).padStart(13, '0')}`, thingId: id, jobId: jid, title: `Job ${j + 1} of thing ${i + 1}`, ymd: `${2024 + (k % 3)}-${month}-15`, distance: null, cost: 1000 + k, note: '', skipped: false, createdAt: k });
          }
        }
      }
      const file = { kind: 'plainkeep-backup', version: 1, exportedAt: 1, doc: { format: 1, things, jobs, entries, settings: { currency: 'USD', distanceUnit: 'mi', leadDays: 7, remindHour: 9, remindMinute: 0, reminders: true, onboarded: true }, updatedAt: 1 } };
      const big = path.join(SHOTS, 'heavy-backup.json');
      fs.writeFileSync(big, JSON.stringify(file));
      await start(p3, url);
      await h3.tap('welcome-skip');
      await h3.tab('Settings');
      const [chooser] = await Promise.all([p3.waitForEvent('filechooser'), h3.tap('restore')]);
      await chooser.setFiles(big);
      await h3.sees('The backup has 40 things, 400 jobs and 4000 log entries');
      await h3.confirm();
      await h3.sees('Backup restored');
      await h3.confirm();
      let started = Date.now();
      await h3.tab('Due');
      await h3.t('section-overdue').waitFor();
      assert.strictEqual(await h3.rows('job-').count(), 400);
      const dueMs = Date.now() - started;
      await h3.shot('40-heavy-due');
      started = Date.now();
      await h3.tab('Log');
      await h3.t('year-2026').waitFor();
      const logMs = Date.now() - started;
      await h3.shot('41-heavy-log');
      await h3.tab('Things');
      assert.strictEqual(await h3.rows('thing-status-').count(), 40);
      await h3.tab('Settings');
      // Whether reminders are on is this phone's choice, not the backup's: still off after the restore.
      assert.strictEqual(await h3.t('coming').count(), 0);
      await h3.tap('reminders-switch');
      await h3.tap('coming');
      await h3.t('planned-0').waitFor();
      assert.ok((await h3.rows('planned-').count()) <= 48);
      console.log(`     400 jobs listed in ${dueMs} ms, 4,000 log entries in ${logMs} ms`);
      assert.ok(dueMs < 8000 && logMs < 8000, 'a very large household must still open in a few seconds');
    });

    await heavy.context.close();

    // ---------------------------------------------------------------- dark mode and the smallest phone
    for (const variant of [
      { name: 'dark', dark: true, viewport: PHONE },
      { name: 'small', dark: false, viewport: SMALL },
    ]) {
      const ctx = await newPhone(browser, { label: variant.name, dark: variant.dark, viewport: variant.viewport });
      const p = ctx.page;
      const hx = helpers(p);
      await step(`${variant.name}: the main screens`, async () => {
        await start(p, url);
        await hx.shot(`50-${variant.name}-welcome`);
        await hx.tap('welcome-skip');
        await hx.loadSample();
        await hx.tab('Due');
        await hx.shot(`51-${variant.name}-due`, { tall: variant.name === 'small' ? 1400 : 1500 });
        await hx.tab('Things');
        await hx.shot(`52-${variant.name}-things`, { tall: 1100 });
        await hx.openThing('Outback');
        await hx.shot(`53-${variant.name}-thing`, { tall: 1400 });
        await hx.openJob('Oil and filter change');
        await hx.shot(`54-${variant.name}-job`, { tall: 1100 });
        await hx.tap('job-done');
        await hx.t('done-form').waitFor();
        await hx.shot(`55-${variant.name}-done`);
        await hx.tap('form-cancel');
        await p.waitForTimeout(500);
        await hx.back();
        await hx.back();
        await hx.tab('Log');
        await hx.shot(`56-${variant.name}-log`, { tall: 1100 });
        await hx.tab('Settings');
        await hx.shot(`57-${variant.name}-settings`, { tall: 1900 });
        await hx.tap('pro-row');
        await hx.shot(`58-${variant.name}-pro`);
        await hx.tap('pro-close');
      });
      await ctx.context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\nAll ${stepCount} steps passed with no console errors. Screenshots: ${SHOTS}`);
}

main().catch((e) => {
  if (problems.length > 0) console.log(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  else console.error(e);
  process.exit(1);
});
