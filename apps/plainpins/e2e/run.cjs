// The end-to-end run: drives the exported web build in a headless browser at
// iPhone sizes, through every flow a person would use.
//
//   npm run export:web   (with APP_BASE_URL=/game-studio/apps/plainpins)
//   node e2e/run.cjs
//
// Needs Playwright, so it runs in the workspace, not in CI.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { listen } = require('./serve.cjs');

const SIZES = [
  { name: 'iPhone 17', width: 393, height: 852 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

// A tiny real PNG (a 2x2 square), written out so the photo picker has something to take.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8Dwn4GBgYmBgYGBAQAOHAEDxnTn8QAAAABJRU5ErkJggg==', 'base64');

let failures = 0;
const log = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${text}`);
};

async function run(size, scheme) {
  console.log(`\n${size.name} (${size.width}x${size.height}), ${scheme}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plainpins-e2e-'));
  const photoPath = path.join(tmp, 'beach.png');
  fs.writeFileSync(photoPath, PNG);

  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  const tid = (id) => page.getByTestId(id);
  const tab = (name) => page.getByRole('tab', { name }).click();
  const text = (id) => tid(id).innerText();
  const step = async (name, work) => {
    try {
      await work();
      log(true, name);
    } catch (e) {
      log(false, `${name}\n        ${String(e).split('\n')[0]}`);
      await page.screenshot({ path: path.join(tmp, `fail-${Date.now()}.png`) }).catch(() => {});
      throw e;
    }
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(what);
  };
  const dialogButton = (label) => page.getByRole('button', { name: label, exact: true }).last();
  const noOverflow = async (what) => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide <= 1, `${what}: the page is ${wide}px wider than the screen`);
  };

  /** Opens the first card's place: one tap chooses it, a second opens it (one is enough when it is already chosen). */
  const openFirstCard = async () => {
    const card = page.locator('[data-testid^="card-"]').first();
    await card.click();
    const opened = await tid('place-screen').waitFor({ timeout: 1200 }).then(() => true, () => false);
    if (!opened) await card.click();
    await tid('place-screen').waitFor();
  };

  /** Puts a pin where the map is looking and fills in the form. */
  const addPlace = async ({ name, kind, people = [], story = '', photos = 0, save = true }) => {
    await tab('Map');
    await tid('add-place').click();
    await tid('placing-sheet').waitFor();
    await tid('placing-confirm').click();
    await tid('place-form').waitFor();
    await tid('form-name').fill(name);
    if (kind) await tid(`form-kind-${kind}`).click();
    for (const person of people) {
      await tid('form-person').fill(person);
      await tid('form-person').press('Enter');
    }
    if (story) await tid('form-story').fill(story);
    for (let i = 0; i < photos; i++) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tid('form-add-photos').click()]);
      await chooser.setFiles(photoPath);
      await tid(`form-photo-${i}`).waitFor();
    }
    if (save) {
      await tid('form-save').click();
      await tid('place-form').waitFor({ state: 'detached' });
    }
  };

  try {
    await step('a fresh install opens on the welcome screen', async () => {
      await page.goto(url);
      await tid('welcome-start').waitFor();
      await noOverflow('welcome');
    });

    await step('the map starts empty and says so', async () => {
      await tid('welcome-start').click();
      await tid('map-empty').waitFor();
      expect((await text('legend-count')) === 'Nowhere yet', 'legend should say Nowhere yet');
      await tab('Places');
      await tid('places-empty').waitFor();
      await tab('Map');
    });

    await step('a place needs a name', async () => {
      await tid('map-empty-add').click();
      await tid('placing-sheet').waitFor();
      expect(/° [NS], .*° [EW]/.test(await text('placing-coords')), 'the pin should show coordinates');
      await tid('placing-confirm').click();
      await tid('place-form').waitFor();
      await tid('form-save').click();
      await page.getByText('Give the place a name.').waitFor();
      await dialogButton('OK').click();
    });

    await step('a place can be added with a kind, people, a story and a photo', async () => {
      await tid('form-name').fill('Holland State Park');
      await tid('form-kind-beach').click();
      await tid('form-person').fill('Maya');
      await tid('form-person').press('Enter');
      await tid('form-person').fill('Jordan,');
      await tid('form-people').getByText('Jordan').waitFor();
      await tid('form-person').fill('maya');
      await tid('form-person').press('Enter');
      expect((await tid('form-people').getByText(/maya/i).count()) === 1, 'the same person should not be added twice');
      await tid('form-story').fill('Swam out to the sandbar and stayed for the sunset.');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tid('form-add-photos').click()]);
      await chooser.setFiles(photoPath);
      await tid('form-photo-0').waitFor();
      await noOverflow('form');
      await tid('form-save').click();
      await tid('place-strip').waitFor();
      expect((await text('legend-count')) === '1 place', 'legend should say 1 place');
      await page.locator('[data-testid^="pin-"]').first().waitFor();
    });

    await step('the place page shows everything that was entered', async () => {
      await openFirstCard();
      expect((await text('place-name')) === 'Holland State Park', 'name');
      expect((await text('place-story')).includes('sandbar'), 'story');
      expect((await text('place-people')).includes('Maya') && (await text('place-people')).includes('Jordan'), 'people');
      expect(/° N, .*° [EW]/.test(await text('place-coords')), 'coordinates');
      await noOverflow('place');
    });

    await step('a photo opens full-screen and closes', async () => {
      await page.getByLabel('Photo 1 of 1').first().click();
      await tid('viewer').waitFor();
      expect((await text('viewer-count')).toLowerCase() === '1 of 1', 'viewer count');
      await tid('viewer-close').click();
      await tid('place-screen').waitFor();
    });

    await step('a favorite is marked and unmarked', async () => {
      await tid('place-favorite').click();
      await page.getByRole('button', { name: 'Remove from favorites' }).waitFor();
      await tid('place-favorite').click();
      await page.getByRole('button', { name: 'Add to favorites' }).waitFor();
      await tid('place-favorite').click();
    });

    await step('editing changes the place; cancelling an edit asks first and changes nothing', async () => {
      await tid('place-edit').click();
      await tid('place-form').waitFor();
      await tid('form-name').fill('Big Red');
      await tid('form-cancel').click();
      await dialogButton('Keep editing').click();
      await tid('form-cancel').click();
      await dialogButton('Discard').click();
      await tid('place-screen').waitFor();
      expect((await text('place-name')) === 'Holland State Park', 'the name should be unchanged');
      await tid('place-edit').click();
      await tid('form-name').fill('Holland State Park, Big Red');
      await tid('form-locality').fill('Holland, MI');
      await tid('form-country').fill('United States');
      await tid('form-save').click();
      await tid('place-screen').waitFor();
      expect((await text('place-name')) === 'Holland State Park, Big Red', 'the new name should show');
    });

    await step('show on the map goes back to the map with the place chosen', async () => {
      await tid('place-show-map').click();
      await tid('map-screen').waitFor();
      await tid('place-strip').waitFor();
    });

    await step('everything is still there after the app is closed and opened', async () => {
      await page.waitForTimeout(500);
      await page.reload();
      await tid('place-strip').waitFor();
      expect((await text('legend-count')) === '1 place', 'legend after reload');
      await openFirstCard();
      await page.getByLabel('Photo 1 of 1').first().waitFor();
      await tid('place-back').click();
    });

    await step('very long text fits', async () => {
      await addPlace({
        name: 'The longest name anyone could reasonably give a place they once visited on holiday',
        kind: 'landmark',
        people: ['Bartholomew Featherstonehaugh-Cholmondeley', 'Jo'],
        story: 'word '.repeat(700),
      });
      await noOverflow('map with a long name');
      await tab('Places');
      await tid('places-screen').waitFor();
      await noOverflow('places with a long name');
      await page.locator('[data-testid^="row-"]').first().click();
      await tid('place-screen').waitFor();
      await noOverflow('place with a long name');
      await tid('place-back').click();
    });

    await step('search and filters narrow the list, and say so when nothing matches', async () => {
      await tab('Places');
      await tid('places-search').fill('big red');
      expect((await page.locator('[data-testid^="row-"]').count()) === 1, 'one match for "big red"');
      await tid('places-search').fill('jordan');
      expect((await page.locator('[data-testid^="row-"]').count()) === 1, 'one match for a person');
      await tid('places-search').fill('nowhere at all');
      await tid('places-none').waitFor();
      await tid('places-search').fill('');
      await tid('filter-landmark').click();
      expect((await page.locator('[data-testid^="row-"]').count()) === 1, 'one landmark');
      await tid('filter-landmark').click();
      await tid('filter-favorites').click();
      expect((await page.locator('[data-testid^="row-"]').count()) === 1, 'one favorite');
      await tid('filter-favorites').click();
      expect((await page.locator('[data-testid^="row-"]').count()) === 2, 'both places again');
    });

    await step('a place is deleted, after asking', async () => {
      await page.locator('[data-testid^="row-"]').first().click();
      await tid('place-edit').click();
      await tid('form-delete').scrollIntoViewIfNeeded();
      await tid('form-delete').click();
      await dialogButton('Cancel').click();
      await tid('form-delete').click();
      await dialogButton('Delete place').click();
      await tid('places-screen').waitFor();
      expect((await page.locator('[data-testid^="row-"]').count()) === 1, 'one place left');
    });

    await step('free: six photos to a place, then the Pro screen', async () => {
      await tab('Map');
      await openFirstCard();
      await tid('place-edit').click();
      for (let i = 1; i < 6; i++) {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tid('form-add-photos').click()]);
        await chooser.setFiles(photoPath);
        await tid(`form-photo-${i}`).waitFor();
      }
      await tid('form-add-photos').click();
      await tid('pro-screen').waitFor();
      expect((await text('pro-status')).includes('6 photos'), 'the Pro screen should say why');
      await noOverflow('pro');
      await tid('pro-close').click();
      await tid('form-save').click();
      await tid('place-screen').waitFor();
      await tid('place-grid').waitFor();
      await tid('place-back').click();
    });

    await step('the cover can be changed and a photo removed', async () => {
      await openFirstCard();
      await tid('place-edit').click();
      await tid('form-photo-2').click();
      await dialogButton('Make this the cover').click();
      await tid('form-photo-5').click();
      await dialogButton('Remove photo').click();
      await tid('form-photo-5').waitFor({ state: 'detached' });
      await tid('form-save').click();
      await tid('place-screen').waitFor();
      await page.getByLabel('Photo 1 of 5').first().waitFor();
      await tid('place-back').click();
    });

    await step('free: the satellite globe opens the Pro screen', async () => {
      await tid('style-button').click();
      await tid('pro-screen').waitFor();
      expect((await text('pro-status')).includes('satellite'), 'the Pro screen should say why');
      await tid('pro-buy').click();
      await page.getByText('Purchases aren’t switched on in this build').waitFor();
      await dialogButton('OK').click();
      await tid('pro-restore').click();
      await dialogButton('OK').click();
      await tid('pro-close').click();
      await tab('Settings');
      await tid('style-satellite').click();
      await tid('pro-screen').waitFor();
      await tid('pro-close').click();
    });

    let backupPath = '';
    await step('a backup is saved as a file', async () => {
      await tab('Settings');
      await noOverflow('settings');
      const [download] = await Promise.all([page.waitForEvent('download'), tid('backup').click()]);
      backupPath = path.join(tmp, download.suggestedFilename());
      await download.saveAs(backupPath);
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      expect(backup.kind === 'plainpins-backup' && backup.doc.places.length === 1, 'the backup should hold the place');
      expect(Object.keys(backup.photos).length === 5, 'the backup should hold its five photos');
    });

    await step('the small sample fits the free version', async () => {
      await tid('dev-sample').click();
      await tid('sample-screen').waitFor();
      await noOverflow('sample');
      await tid('sample-starter').click();
      await dialogButton('Replace').click();
      await tid('place-strip').waitFor();
      expect((await text('legend-count')) === '9 places', 'nine sample places');
    });

    await step('the full sample fills the map', async () => {
      await tab('Settings');
      await tid('dev-sample').click();
      await tid('sample-full').click();
      await dialogButton('Replace').click();
      await tid('place-strip').waitFor();
      expect((await text('legend-count')) === '44 places', '44 sample places');
      expect((await text('legend-reach')).includes('5 countries'), 'five countries');
      expect((await page.locator('[data-testid^="pin-"]').count()) > 20, 'pins on the globe');
      await noOverflow('full map');
    });

    await step('a pin brings up its card; the globe button zooms out and in', async () => {
      const pin = page.locator('[data-testid^="pin-"]').last();
      const id = (await pin.getAttribute('data-testid')).replace('pin-', '');
      await pin.dispatchEvent('click');
      await page.waitForTimeout(900);
      expect(await tid(`card-${id}`).isVisible(), 'the card for the pin should be in view');
      const before = await tid('map-camera').textContent();
      await tid('globe-button').click();
      await page.waitForTimeout(900);
      expect((await tid('map-camera').textContent()) !== before, 'the globe button should move the map');
      await tid('zoom-in').click();
      await tid('zoom-out').click();
    });

    await step('swiping the cards flies the map to the next place', async () => {
      const before = await tid('map-camera').textContent();
      await tid('place-strip').evaluate((el) => el.scrollBy({ left: 700 }));
      await page.waitForTimeout(1300);
      expect((await tid('map-camera').textContent()) !== before, 'the map should have moved');
    });

    await step('Pro: the full list, the satellite switch, and no limit on places', async () => {
      await tab('Places');
      expect((await text('places-tally')).toLowerCase().includes('44 places'), 'tally');
      await noOverflow('full places list');
      await tab('Settings');
      await tid('style-satellite').click();
      expect(!(await tid('pro-screen').isVisible().catch(() => false)), 'satellite should not ask for Pro');
      await tid('style-standard').click();
      await addPlace({ name: 'Number forty-five', kind: 'city' });
      expect((await text('legend-count')) === '45 places', 'a 45th place with Pro');
    });

    await step('free again: everything stays, and one more place needs Pro', async () => {
      await tab('Settings');
      await tid('dev-pretend-pro').click();
      await tab('Map');
      expect((await text('legend-count')) === '45 places', 'nothing is taken away');
      await tid('add-place').click();
      await tid('pro-screen').waitFor();
      expect((await text('pro-status')).includes('25 places'), 'the Pro screen should say why');
      await tid('pro-close').click();
      await openFirstCard();
      await tid('place-edit').click();
      await tid('form-story').fill('Edited while over the free limit.');
      await tid('form-save').click();
      await tid('place-screen').waitFor();
      expect((await text('place-story')).includes('over the free limit'), 'editing still works over the limit');
      await tid('place-back').click();
    });

    await step('a file that is not a backup is refused', async () => {
      const bad = path.join(tmp, 'notes.json');
      fs.writeFileSync(bad, '{"hello":"world"}');
      await tab('Settings');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tid('restore').click()]);
      await chooser.setFiles(bad);
      await page.getByText('That isn’t a Plainpins backup').waitFor();
      await dialogButton('OK').click();
    });

    await step('erase everything empties the map', async () => {
      await tid('erase-everything').click();
      await dialogButton('Erase everything').click();
      await dialogButton('OK').click();
      await tab('Map');
      await tid('map-empty').waitFor();
    });

    await step('the backup brings the place and its photos back', async () => {
      await tab('Settings');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tid('restore').click()]);
      await chooser.setFiles(backupPath);
      await dialogButton('Replace').click();
      await page.getByText('Backup restored').waitFor();
      await dialogButton('OK').click();
      await tab('Map');
      expect((await text('legend-count')) === '1 place', 'one place restored');
      await openFirstCard();
      await page.getByLabel('Photo 1 of 5').first().waitFor();
      expect((await text('place-name')) === 'Holland State Park, Big Red', 'the restored name');
      await tid('place-back').click();
    });

    await step('a deep link to a page that is gone says so', async () => {
      await page.goto(`${url}?p=/place/does-not-exist`);
      await tid('place-missing').waitFor();
    });

    await step('nothing was written to the console as an error', async () => {
      expect(errors.length === 0, `console errors:\n${errors.join('\n')}`);
    });
  } catch {
    // The failing step has already been reported.
  } finally {
    await browser.close();
    server.close();
  }
}

(async () => {
  await run(SIZES[0], 'light');
  await run(SIZES[1], 'dark');
  console.log(failures === 0 ? '\nAll steps passed.' : `\n${failures} step(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
