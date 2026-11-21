// Screenshots of every screen from the exported web build, for looking at.
//   node e2e/shots.cjs <out-dir> [light|dark]
const path = require('path');
const { chromium } = require('playwright');
const { listen } = require('./serve.cjs');

const out = process.argv[2] || path.join(__dirname, 'shots');
const scheme = process.argv[3] === 'dark' ? 'dark' : 'light';
const SCALE = Number(process.env.SHOT_SCALE || 2);

(async () => {
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: SCALE, colorScheme: scheme, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(out, `${scheme}-${name}.png`) });
  };
  const tid = (id) => page.getByTestId(id);

  await page.goto(url);
  await tid('welcome-start').waitFor();
  await shot('01-welcome');
  await tid('welcome-start').click();
  await tid('map-empty').waitFor();
  await shot('02-map-empty');

  await page.getByRole('tab', { name: 'Settings' }).click();
  await tid('pro-row').click();
  await tid('pro-screen').waitFor();
  await shot('02b-pro-locked');
  await tid('pro-close').click();
  await tid('dev-sample').click();
  await tid('sample-screen').waitFor();
  await shot('03-sample');
  await tid('sample-full').click();
  await tid('place-strip').waitFor();
  await page.waitForTimeout(900);
  await shot('04-map-globe');

  // Fly to the first card.
  await page.locator('[data-testid^="card-"]').first().click();
  await page.waitForTimeout(1200);
  await shot('05-map-place');
  await tid('zoom-out').click();
  await tid('zoom-out').click();
  await page.waitForTimeout(1200);
  await shot('06-map-region');

  await page.locator('[data-testid^="card-"]').first().click();
  await tid('place-screen').waitFor();
  await shot('07-place');
  await page.mouse.wheel(0, 600);
  await shot('08-place-lower');
  await tid('place-edit').click();
  await tid('place-form').waitFor();
  await shot('09-form');
  await tid('place-form').evaluate((el) => { el.scrollTop = 620; });
  await page.waitForTimeout(300);
  await shot('10-form-lower');
  await tid('form-cancel').click();
  await tid('place-back').click();

  await page.getByRole('tab', { name: 'Places' }).click();
  await tid('places-screen').waitFor();
  await shot('11-places');
  await page.getByRole('tab', { name: 'Settings' }).click();
  await shot('12-settings');
  await tid('pro-row').click();
  await tid('pro-screen').waitFor();
  await shot('13-pro');
  await tid('pro-close').click();

  await page.getByRole('tab', { name: 'Map' }).click();
  await tid('add-place').click();
  await tid('placing-sheet').waitFor();
  await shot('14-placing');

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('Console errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('Shots written to', out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
