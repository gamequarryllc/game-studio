// Uses the app from end to end in a headless browser, the way a person would
// on a phone: a fresh start, every setting, the always-allowed list, draining
// the battery cell by cell, the warning and empty screens at each level, the
// sums, a reload, and a recharge. It fails on any broken expectation and on
// any console error.
//
//   APP_BASE_URL=/game-studio/apps/screen-battery EXPO_OFFLINE=1 npx expo export --platform web
//   node e2e/run.cjs                # screenshots go to a temp folder
//   SHOTS_DIR=/some/folder node e2e/run.cjs
//
// Needs Playwright with Chromium (the studio workspace has both).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');

const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'screen-battery-shots-'));
const PHONE = { width: 393, height: 852 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const problems = [];
let steps = 0;

async function step(name, fn) {
  steps += 1;
  try {
    await fn();
    console.log(`ok   ${String(steps).padStart(2)}  ${name}`);
  } catch (e) {
    console.log(`FAIL ${String(steps).padStart(2)}  ${name}\n      ${e.message.split('\n')[0]}`);
    problems.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'dark', locale: 'en-US' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const see = (text) => page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
  const gone = (text) => page.getByText(text, { exact: true }).first().waitFor({ state: 'hidden', timeout: 8000 });
  const press = (name) => page.getByRole('button', { name, exact: true }).first().click();
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const back = async () => {
    await page.goBack();
    await page.waitForTimeout(250);
  };

  await step('a fresh start shows a full battery', async () => {
    await page.goto(url);
    await see('Today');
    await see('Plenty left');
    await see('Recharges at 6:00 AM');
    await see('0:00 of 3:00');
    await page.getByLabel('Battery, 6 of 6 cells left').waitFor();
    await shot('01-today-full');
  });

  await step('the goal steps by quarter hours and stops at its limits', async () => {
    await tab('Settings');
    await see('3:00');
    await press('More time');
    await see('3:15');
    await press('Less time');
    await press('Less time');
    await see('2:45');
    for (let i = 0; i < 12; i++) await press('Less time');
    await see('0:30');
    for (let i = 0; i < 10; i++) await press('More time');
    await see('3:00');
    await shot('02-settings');
  });

  await step('the recharge time steps by half hours', async () => {
    await press('Recharge later');
    await see('6:30 AM');
    await press('Recharge earlier');
    await see('6:00 AM');
  });

  await step('what counts can be changed, and custom picks wait for Pro', async () => {
    await press('What counts, Everything');
    await see('Choose which apps drain your battery.');
    await shot('03-what-counts');
    await page.getByRole('radio', { name: /Time-wasters/ }).click();
    assert.strictEqual(await page.getByRole('radio', { name: /Time-wasters/ }).getAttribute('aria-checked'), 'true');
    assert.strictEqual(await page.getByRole('radio', { name: /Everything/ }).getAttribute('aria-checked'), 'false');
    assert.ok(await page.getByRole('radio', { name: /Your own picks/ }).isDisabled());
    await back();
    await page.getByRole('button', { name: 'What counts, Time-wasters' }).waitFor();
  });

  await step('apps can be removed from and added to the always-allowed list', async () => {
    await press('Always allowed, 3 apps');
    await see('These still open when the battery is empty.');
    await shot('04-allowed');
    await press('Remove Maps');
    await gone('Maps');
    await page.getByRole('textbox').fill('  Camera ');
    await press('Add');
    await see('Camera');
    await page.getByRole('textbox').fill('camera');
    await press('Add');
    assert.strictEqual(await page.getByText('Camera', { exact: true }).count(), 1, 'a second "camera" must not be added');
    await page.getByRole('textbox').fill('   ');
    await press('Add');
    await page.getByRole('textbox').fill('A very long app name that goes on and on past forty characters');
    await press('Add');
    await shot('05-allowed-edited');
    await press('Remove A very long app name that goes on and on');
    await back();
    await page.getByRole('button', { name: 'Always allowed, 3 apps' }).waitFor();
  });

  await step('pretend use empties the battery a cell at a time', async () => {
    await press('Use 30 more minutes');
    await tab('Today');
    await page.getByLabel('Battery, 5 of 6 cells left').waitFor();
    await see('0:30 of 3:00');
    await tab('Settings');
    for (let i = 0; i < 3; i++) await press('Use 30 more minutes');
    await tab('Today');
    await see('Getting low');
    await page.getByLabel('Battery, 2 of 6 cells left').waitFor();
    await shot('06-today-low');
    await tab('Settings');
    await press('Use 30 more minutes');
    await tab('Today');
    await see('Nearly out');
    await see('2:30 of 3:00');
    await shot('07-today-last-cell');
  });

  await step('the warning screen names the recharge time', async () => {
    await tab('Settings');
    await press('See the warning screen');
    await see('Last cell');
    await see('Your battery is nearly out. It recharges at 6:00 AM.');
    await shot('08-warning');
    await press('Keep going');
    await see('Settings');
  });

  await step('an empty battery offers sums when the level is "Work for it"', async () => {
    await press('Use 30 more minutes');
    await tab('Today');
    await see('Empty');
    await page.getByLabel('Battery, empty').waitFor();
    await see('3:00 of 3:00');
    await page.getByRole('button', { name: 'Solve 3 sums for 15 more minutes' }).waitFor();
    await shot('09-today-empty');
  });

  await step('the empty screen follows each level', async () => {
    await tab('Settings');
    await page.getByRole('radio', { name: /^Warn/ }).click();
    await press('See the empty screen');
    await see("You're past your 3 hours. It recharges at 6:00 AM.");
    await shot('10-empty-warn');
    await press('Keep going anyway');
    await page.getByRole('radio', { name: /^Locked/ }).click();
    await press('See the empty screen');
    await see('Locked until it recharges at 6:00 AM. Phone, Messages and Camera still open.');
    assert.strictEqual(await page.getByRole('button').count(), 1, 'a locked screen has one button');
    await shot('11-empty-locked');
    await press('Close this app');
    await tab('Today');
    await see('Locked until 6:00 AM. Phone, Messages and Camera still open.');
    assert.strictEqual(await page.getByRole('button', { name: /Solve/ }).count(), 0);
    await tab('Settings');
    await page.getByRole('radio', { name: /^Work for it/ }).click();
    await press('See the empty screen');
    await see('Solve 3 sums for 15 more minutes, or wait until it recharges at 6:00 AM.');
    await shot('12-empty-work');
  });

  async function solve(count, name) {
    for (let i = 0; i < count; i++) {
      await see(`Sum ${i + 1} of ${count}`);
      const label = await page.getByLabel(/^\d+ plus \d+$/).getAttribute('aria-label');
      const [a, b] = label.match(/\d+/g).map(Number);
      assert.ok(a >= 12 && b >= 11 && (a % 10) + (b % 10) >= 10, `sum ${label} should need a carry`);
      if (i === 0) {
        await page.getByRole('textbox').fill(String(a + b + 1));
        await press('Check');
        await see(`Not ${a + b + 1}. Try again.`);
        await shot(`${name}-wrong`);
        await page.getByRole('textbox').fill('12abc');
        assert.strictEqual(await page.getByRole('textbox').inputValue(), '12', 'only digits can be typed');
        await page.getByRole('textbox').fill('');
        await press('Check');
        await see('Sum 1 of ' + count);
      }
      await page.getByRole('textbox').fill(String(a + b));
      if (i === 0) await shot(`${name}-sum`);
      await press('Check');
    }
  }

  await step('three right sums earn fifteen minutes', async () => {
    await press('I need more time');
    await see('Earn 15 minutes');
    await solve(3, '13-puzzle');
    await see('15 minutes earned');
    await see("Next time it's 5 sums for 10 minutes.");
    await shot('14-puzzle-earned');
    await press('Done');
    await tab('Today');
    await page.getByText(/^Earned time runs until \d{1,2}:\d{2} (AM|PM)\.$/).waitFor();
    assert.strictEqual(await page.getByRole('button', { name: /Solve/ }).count(), 0, 'no second offer while earned time runs');
    await shot('15-today-earned');
  });

  await step('the next top-up costs five sums for ten minutes', async () => {
    await page.goto(url + 'puzzle');
    await see('Earn 10 minutes');
    await solve(5, '16-puzzle-second');
    await see('10 minutes earned');
    await see("Next time it's 7 sums for 5 minutes.");
    await press('Done');
  });

  await step('everything is still there after closing and reopening', async () => {
    await page.goto(url);
    await see('Empty');
    await see('3:00 of 3:00');
    await page.getByText(/^Earned time runs until/).waitFor();
    await tab('Settings');
    await page.getByRole('button', { name: 'What counts, Time-wasters' }).waitFor();
    await page.getByRole('button', { name: 'Always allowed, 3 apps' }).waitFor();
  });

  await step('going far past the goal stays empty and tidy', async () => {
    for (let i = 0; i < 8; i++) await press('Use 30 more minutes');
    await tab('Today');
    await see('Empty');
    await see('7:00 of 3:00');
    await shot('17-today-far-past');
  });

  await step('the sums are refused while there is battery left', async () => {
    await tab('Settings');
    await press('Recharge now');
    await tab('Today');
    await see('Plenty left');
    await see('0:00 of 3:00');
    assert.strictEqual(await page.getByText(/^Earned time runs until/).count(), 0);
    await page.goto(url + 'puzzle');
    await see('Nothing to earn');
    await shot('18-puzzle-refused');
    await press('Back');
    await see('Today');
  });

  await step('a reloaded inner page and an unknown page both land somewhere sensible', async () => {
    await page.goto(url + '?p=/settings');
    await see('Daily goal');
    await page.goto(url + 'nowhere/at/all');
    await see("That page isn't here");
    await press('Back to Today');
    await see('Plenty left');
  });

  await step('a small phone and large text still fit', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(url);
    await see('Plenty left');
    await page.waitForTimeout(300);
    await shot('19-today-small');
    await tab('Settings');
    await see('Daily goal');
    await see('3:00');
    await page.waitForTimeout(300);
    await shot('20-settings-small');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.strictEqual(wide, false, 'nothing may run off the side of a small phone');
    // A button that pokes out of its card is clipped, not scrolled, so measure each one.
    const out = await page.evaluate(() =>
      [...document.querySelectorAll('[role="button"], [role="radio"], [role="tab"]')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth - 20 + 0.5 || e.getBoundingClientRect().left < 20 - 0.5)
        .map((e) => e.getAttribute('aria-label') || e.textContent),
    );
    assert.deepStrictEqual(out, [], 'every button stays inside the page margins on a small phone');
  });

  await browser.close();
  server.close();
  console.log(`\nScreenshots: ${SHOTS}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):\n  ` + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`\nAll ${steps} steps passed with no console errors.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
