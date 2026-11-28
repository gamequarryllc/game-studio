// Uses the app from end to end in a headless browser, the way a person would
// on a phone: a fresh start, every setting, the Essentials screen, draining
// the battery cell by cell, the warning and empty screens at each level, the
// sums, a reload, and a recharge. It fails on any broken expectation and on
// any console error.
//
//   APP_BASE_URL=/game-studio/apps/plainlimit EXPO_OFFLINE=1 npx expo export --platform web
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

const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'plainlimit-shots-'));
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
    console.log(`FAIL ${String(steps).padStart(2)}  ${name}\n      ${e.message.split("\n").slice(0,6).join(" | ")}`);
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

  // Colours and cells ease into place; a picture is taken once they have settled.
  const shot = async (name) => {
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  const see = (text) => page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
  // Today's figure and goal: "0:30 used of 3:00", read from the row's label.
  const used = (figure, goal) => page.getByLabel(new RegExp(`^${figure} used of ${goal},`)).first().waitFor({ state: 'visible', timeout: 8000 });
  const press = (name) => page.getByRole('button', { name, exact: true }).first().click();
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const back = async () => {
    await page.goBack();
    await page.waitForTimeout(250);
  };

  await step('a first launch goes through setup', async () => {
    await page.goto(url);
    // The story first, one thing a screen: what it is, what is not counted, when it comes back.
    await see('Your screen time is a battery');
    await page.getByText(/Using your apps drains it\./).first().waitFor({ state: 'visible', timeout: 8000 });
    for (const moment of ['Full', 'Running low', 'Apps lock']) await see(moment);
    await shot('00-setup-welcome');
    await press('Next');
    await see('Your essential apps don’t count');
    // No boxes and no small capitals since build 173: the two kinds of app are pictures, each beside its word.
    for (const words of ['Apps you pick', 'Not counted', 'Everything else', 'Counted', 'Use your phone. Don’t abuse it.', 'You pick them in a moment.']) await see(words);
    if ((await page.getByText(/^(NOT COUNTED|COUNTED)$/).count()) > 0) throw new Error('the second screen still has its capital labels');
    if ((await page.getByText(/\bfree\b/i).count()) > 0) throw new Error('the second screen still says "free"');
    await shot('00-setup-free');
    await press('Next');
    await see('Full again every morning');
    await see('Your battery recharges at 6:00 AM.');
    await see('A late night never eats into tomorrow.');
    await shot('00-setup-morning');
    await press('Next');
    // The essentials, before the goal. (Apple's list is a phone's; the preview says so and moves on.)
    await see('Pick your essential apps');
    await see('On an iPhone you tick them in Apple\'s own list of your apps. This preview runs on pretend use.');
    await page.getByLabel('Step 4 of 7', { exact: true }).waitFor();
    await shot('00-setup-essentials');
    await press('Next');
    // Notifications, with their reason, where the question used to come cold after the last screen. A phone draws the next screen's chart behind this one.
    await see('Notifications need to be on');
    await see('A warning when you’re nearly out');
    await see('The pop-up to earn more time');
    await see('Nothing else, ever');
    await see('Without them, asking for more time on a locked app does nothing.');
    await page.getByLabel('Step 5 of 7', { exact: true }).waitFor();
    await shot('00-setup-notify');
    await press('Not now');
    // The goal: what the number is and what happens at it in one line, and the minus and plus at the foot, over "Next".
    await see('Daily screen time');
    await see('3:00 of use, then apps lock until 6:00 AM.');
    await see('Six cells of 30 minutes each');
    {
      const box = async (name) => page.getByRole('button', { name, exact: true }).first().boundingBox();
      const [less, more, on] = [await box('Less time'), await box('More time'), await box('Next')];
      if (!less || !more || !on) throw new Error('the goal screen is missing its minus, its plus or "Next"');
      if (less.y + less.height > on.y || more.y + more.height > on.y) throw new Error('the goal\'s minus and plus are not over "Next"');
      if (on.y - (less.y + less.height) > 40) throw new Error('the goal\'s minus and plus are not at the foot of the screen, by "Next"');
    }
    await press('More time');
    await see('3:15 of use, then apps lock until 6:00 AM.');
    await press('Less time');
    await see('3:00 of use, then apps lock until 6:00 AM.');
    await shot('00-setup-goal');
    await press('Back');
    await see('Notifications need to be on');
    // Allowing moves on by itself; coming back, the screen says they are on.
    await press('Allow notifications');
    await see('Daily screen time');
    await press('Back');
    await see('They’re on.');
    await press('Next');
    await press('Next');
    await see("You're set");
    await see('Your picks');
    await shot('00-setup-done');
    await press('Go to Today');
  });

  await step('a fresh start shows a full battery', async () => {
    await see('Today');
    await see('Plenty left');
    await see('Recharges at 6:00 AM');
    // The emergency pass is on Today from the start, grey until the battery is empty.
    await page.getByLabel('Emergency pass, 1 saved. When your battery is empty', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
    await used('0:00', '3:00');
    await page.getByLabel('Battery, 6 of 6 cells left').waitFor();
    await shot('01-today-full');
  });

  await step('the goal steps by quarter hours and stops at its limits', async () => {
    await tab('Settings');
    await see('3:00');
    // Setup's own day: every change starts now, and the note says what comes after.
    await see('Your first day: changes start now');
    await press('More time');
    await see('3:15');
    await press('Less time');
    await press('Less time');
    await see('2:45');
    for (let i = 0; i < 9; i++) await press('Less time');
    await see('0:30');
    // At a limit the button looks closed rather than doing nothing.
    if (!(await page.getByRole('button', { name: 'Less time', exact: true }).first().isDisabled())) throw new Error('"Less time" is still open at the shortest goal');
    for (let i = 0; i < 10; i++) await press('More time');
    await see('3:00');
    await shot('02-settings');
  });

  await step('without Pro, the recharge time, harder sums, Second thought and a lock message of one\'s own lead to the Pro screen; the ready-made lock messages are open', async () => {
    // The extras are four tiles on Settings, under "Do more"; there is no Advanced page.
    await see('Do more');
    assert.strictEqual(await page.getByRole('button', { name: 'Advanced', exact: true }).count(), 0, 'Settings still has an Advanced row');
    await press('Recharge time, 6:00 AM, Pro');
    await page.getByTestId('pro-screen').waitFor();
    await see('Your recharge time');
    await shot('02b-pro');
    await press('Unlock all five · $9.99');
    await see('Nothing can be bought in this build. To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.');
    await back();
    await page.getByRole('button', { name: 'Recharge time, 6:00 AM, Pro', exact: true }).waitFor();
    // Sums carries the Pro mark too: normal ones are free, easy and hard are Pro.
    await press('Sums, Normal, Pro');
    await shot('02c-sums');
    await page.getByRole('radio', { name: /^Hard/ }).click();
    // The Pro screen opens on the card of the extra that sent someone there.
    await page.getByTestId('pro-screen').waitFor();
    await see('Sum difficulty');
    await back();
    assert.strictEqual(await page.getByRole('radio', { name: /^Normal/ }).getAttribute('aria-checked'), 'true', 'normal sums stay chosen');
    await back();
    // Second thought is Pro: its screen shows what it does and where to get it, with nothing to switch or pick.
    await press('Second thought, Off, Pro');
    await see('A pause before the apps you open without thinking.');
    await see('Second thought is part of Plainlimit Pro.');
    assert.strictEqual(await page.getByRole('switch', { name: 'Second thought' }).count(), 0, 'the Second thought switch shows without Pro');
    assert.strictEqual(await page.getByRole('radio').count(), 0, 'the open times show without Pro');
    await shot('02c-second-thought-free');
    await press('See Plainlimit Pro');
    await page.getByTestId('pro-screen').waitFor();
    await page.getByRole('img', { name: 'An app on your list asks first: one sum, then it opens for 10 minutes.' }).waitFor();
    // Its tiles go to the other extras.
    await press('Large widget');
    await see('Your battery, streak, passes and week on the Home Screen.');
    await back();
    await back();
    await page.getByRole('button', { name: 'Second thought, Off, Pro', exact: true }).waitFor();
    // A ready-made lock message is free; words of one's own are Pro.
    await press('Lock message, Off');
    await press('You set this limit for a reason.');
    await page.getByTestId('lock-message-preview').getByText('\u201CYou set this limit for a reason.\u201D', { exact: false }).waitFor();
    assert.strictEqual(await page.getByTestId('lock-message-input').count(), 0, 'the text box shows without Pro');
    await press('Write your own, Pro');
    await see('Your own lock message');
    await back();
    await press('No message');
    await back();
    await page.getByRole('button', { name: 'Lock message, Off', exact: true }).waitFor();
  });

  await step('with Pro, the recharge time steps by half hours and harder sums can be chosen', async () => {
    await press('Pretend Pro is bought');
    await press('Recharge time, 6:00 AM');
    // By its label: the tile behind, on Settings, says the time too.
    await press('Recharge later');
    await page.getByLabel('Recharges at 6:30 AM', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    await shot('02e-recharge-time');
    await press('Recharge earlier');
    await page.getByLabel('Recharges at 6:00 AM', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    await back();
    await press('Sums, Normal');
    await page.getByRole('radio', { name: /^Hard/ }).click();
    assert.strictEqual(await page.getByRole('radio', { name: /^Hard/ }).getAttribute('aria-checked'), 'true', 'hard sums chosen');
    await back();
    await press('Sums, Hard');
    await page.getByRole('radio', { name: /^Normal/ }).click();
    await back();
    await press('Lock message, Off');
    await press('Text someone you miss.');
    await page.getByTestId('lock-message-preview').getByText('\u201CText someone you miss.\u201D', { exact: false }).waitFor();
    await shot('02d-lock-message');
    // Cleared again, so the empty screens below say only their own words.
    await page.getByTestId('lock-message-input').fill('Read a book instead');
    await page.getByTestId('lock-message-preview').getByText('\u201CRead a book instead\u201D', { exact: false }).waitFor();
    await press('No message');
    await back();
    await page.getByRole('button', { name: 'Lock message, Off', exact: true }).waitFor();
    await press('Second thought, Off');
    await see('A pause before the apps you open without thinking.');
    await back();
  });

  await step('what counts is one list, and there is no always-allowed list', async () => {
    assert.strictEqual(await page.getByRole('button', { name: /^Always allowed/ }).count(), 0, 'the always-allowed list is gone');
    await press('Essentials, Your picks');
    await see('Never counted. Never locked.');
    assert.strictEqual(await page.getByRole('radio').count(), 0, 'no Everything / Only what I tick choice');
    await shot('03-what-counts');
    await back();
    await page.getByRole('button', { name: 'Essentials, Your picks' }).waitFor();
  });

  await step('the tips page opens from Settings', async () => {
    await press('Use your phone less, 9 tips');
    await see('The battery sets the limit. These make it easier to stay under it.');
    await see('Turn the screen gray');
    await shot('03b-tips');
    await back();
    await page.getByRole('button', { name: 'Use your phone less, 9 tips' }).waitFor();
  });

  await step('pretend use empties the battery a cell at a time', async () => {
    await press('Use 30 more minutes');
    await tab('Today');
    await page.getByLabel('Battery, 5 of 6 cells left').waitFor();
    await used('0:30', '3:00');
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
    await used('2:30', '3:00');
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
    await used('3:00', '3:00');
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
    await see("Locked until it recharges at 6:00 AM. Apps that don't count still open.");
    assert.strictEqual(await page.getByRole('button').count(), 1, 'a locked screen has one button');
    await shot('11-empty-locked');
    await press('Close this app');
    await tab('Today');
    await see("Locked until 6:00 AM. Apps that don't count still open.");
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
      const answer = String(a + b);
      if (i === 0) {
        // A miss as long as the answer is said at once, with no button, and the field empties for another go.
        await page.getByRole('textbox').fill(String(a + b + 1));
        await see(`Not ${a + b + 1}. Try again.`);
        assert.strictEqual(await page.getByRole('textbox').inputValue(), '', 'a wrong answer is cleared');
        await shot(`${name}-wrong`);
        await page.getByRole('textbox').fill('1a');
        assert.strictEqual(await page.getByRole('textbox').inputValue(), '1', 'only digits can be typed');
        assert.strictEqual(await page.getByText('Try again', { exact: false }).count(), 0, 'one digit is not a wrong answer yet');
        // The button turns down what is there, and does nothing on an empty field.
        await press('Check');
        await see('Not 1. Try again.');
        await press('Check');
        await see('Sum 1 of ' + count);
        await page.getByRole('textbox').fill(answer.slice(0, -1));
        await shot(`${name}-sum`);
        await page.getByRole('textbox').fill('');
      }
      // Typed a key at a time, the right answer moves on by itself: there is no button to press.
      await page.getByRole('textbox').pressSequentially(answer);
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
    await used('3:00', '3:00');
    await page.getByText(/^Earned time runs until/).waitFor();
    await tab('Settings');
    await page.getByRole('button', { name: 'Essentials, Your picks' }).waitFor();
  });

  await step('going far past the goal stays empty and tidy', async () => {
    for (let i = 0; i < 8; i++) await press('Use 30 more minutes');
    await tab('Today');
    await see('Empty');
    await used('7:00', '3:00');
    await shot('17-today-far-past');
  });

  await step('the sums are refused while there is battery left', async () => {
    await tab('Settings');
    await press('Recharge now');
    await tab('Today');
    await see('Plenty left');
    await used('0:00', '3:00');
    assert.strictEqual(await page.getByText(/^Earned time runs until/).count(), 0);
    await page.goto(url + 'puzzle');
    await see('Nothing to earn');
    await shot('18-puzzle-refused');
    await press('Back');
    await see('Today');
  });

  await step('the week view shows the last seven days and plain counts', async () => {
    // Today shows the week as bars; its words are on History.
    await page.getByLabel(/^Today: at least 0:00 of 3:00, so far$/).first().waitFor();
    // Beside the day's figure, the streak and what it counts: 1 on the first day.
    await page.getByRole('button', { name: '1 day streak, without a pass', exact: true }).waitFor();
    await press('History');
    // History leads with the streak: the days without an emergency pass, 1 on the first day.
    await see('day without an emergency pass');
    await see('Emergency passes');
    await see('Perfect weeks');
    await back();
    await tab('Settings');
    await press('Fill the last week');
    await tab('Today');
    // The streak beside the day's figure opens History too.
    await page.getByRole('button', { name: /^\d+ day streak, without a pass$/ }).click();
    // The pretend week shows as lights, a day each. Its days count for the streak, over the goal or not: only a pass ends it.
    await see('days without an emergency pass');
    await page.getByRole('img', { name: /^The last 5 weeks, a light for each day/ }).waitFor();
    await shot('18b-week');
    await back();
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
