// A picture tour of states the end-to-end walk doesn't reach: a phone that is
// counting (through the preview's "?mock=" stand-in), each counting problem,
// locks held, settings locked, earned time running, odd goals and recharge
// times, a full week of every kind of day, and broken saved data. Each state
// starts from a saved copy written straight into the browser's storage.
//
// It fails on any console error or page error, and on any missing text it
// expects; the pictures are for a person to look over.
//
//   APP_BASE_URL=/game-studio/apps/plainlimit EXPO_OFFLINE=1 npx expo export --platform web
//   node e2e/qa.cjs                 # pictures go to a temp folder
//   SHOTS_DIR=/some/folder node e2e/qa.cjs

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const { listen } = require('./serve.cjs');

const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'plainlimit-qa-'));
const PHONE = { width: 393, height: 852 };
const SMALL = { width: 320, height: 568 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const KEY = 'plainlimit.doc.v1';

const problems = [];
let count = 0;

/** The current battery's start for a recharge minute, like the app works it out. */
function periodStart(rechargeMinute, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(rechargeMinute / 60), rechargeMinute % 60);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

/** A saved copy, set up and counted, with whatever is given in place of the defaults. */
function doc({ goal = 180, recharge = 360, used = 0, topUps = 0, unlockedUntil = null, uncounted = false, level = 'work', history = [] } = {}) {
  return {
    v: 1,
    settings: { goalMinutes: goal, rechargeMinute: recharge, countMode: 'custom', emptyLevel: level, allowed: [] },
    day: { periodStart: periodStart(recharge).toISOString(), usedMinutes: used, topUps, unlockedUntil, uncounted },
    watching: true,
    setupDone: true,
    history,
  };
}

/** Six finished days before today, one of each kind the week can show. */
function mixedWeek(goal, recharge) {
  const today = periodStart(recharge);
  const days = [
    { f: 0.5, state: 'counted', topUps: 0 },
    { f: 1.4, state: 'counted', topUps: 2 },
    { f: 0.7, state: 'partly', topUps: 0 },
    { f: 0, state: 'off', topUps: 0 },
    { f: 1.0, state: 'counted', topUps: 0 },
    { f: 0.95, state: 'counted', topUps: 0, goal: 240 },
  ];
  return days.map((d, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (6 - i));
    const g = d.goal ?? goal;
    return { start: start.toISOString(), goalMinutes: g, usedMinutes: Math.round(g * d.f), topUps: d.topUps, state: d.state };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await listen(0);
  const browser = await chromium.launch();

  /** Opens the app at `query` with `saved` in storage (a string is stored as it is), at the given size. */
  // Most scenarios pretend Pro is bought, so its settings are there to check; `withPro: false` is the free app.
  async function open(saved, query = '', size = PHONE, { withPro = true } = {}) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'dark', locale: 'en-US' });
    await context.addInitScript(
      ([key, value, proKey, pro]) => {
        if (value !== null) window.localStorage.setItem(key, value);
        if (pro) window.localStorage.setItem(proKey, JSON.stringify({ owned: false, pretend: true }));
      },
      [KEY, saved === null ? null : typeof saved === 'string' ? saved : JSON.stringify(saved), 'plainlimit.pro.v1', withPro],
    );
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console error (${query || 'no mock'}): ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error (${query || 'no mock'}): ${e.message}`));
    await page.goto(url + query);
    return { page, context };
  }

  async function scenario(name, fn) {
    count += 1;
    try {
      await fn();
      console.log(`ok   ${String(count).padStart(2)}  ${name}`);
    } catch (e) {
      console.log(`FAIL ${String(count).padStart(2)}  ${name}\n      ${e.message.split('\n').slice(0, 3).join(' | ')}`);
      problems.push(`${name}: ${e.message.split('\n')[0]}`);
    }
  }

  const see = (page, text) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
  const shot = async (page, name, full = false) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
  };
  /** The page's own scroller, scrolled to the end. */
  const toBottom = async (page) => {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight;
      }
    });
    await page.waitForTimeout(400);
  };
  const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();

  await scenario('a counting phone shows its figure and the list box waiting for the phone', async () => {
    const { page, context } = await open(doc({ goal: 270, used: 97 }), '?mock=counting');
    await see(page, 'used of 4:30');
    await shot(page, 'q01-counting-top');
    // The phone's list of apps is last on Today, under the History row.
    await toBottom(page);
    await see(page, 'What used it');
    await see(page, 'Waiting for the phone');
    await shot(page, 'q02-counting-bottom');
    // While counting is on, Settings says nothing about it, and nothing in the app turns it off
    // (a switch for it was an easy way round the day's limit).
    await tab(page, 'Settings');
    if ((await page.getByRole('button', { name: 'Turn on Screen Time', exact: true }).count()) > 0) throw new Error('Settings offers to turn counting on while it is on');
    await shot(page, 'q03-counting-settings');
    await see(page, 'Do more');
    if ((await page.getByRole('switch').count()) > 0) throw new Error('Settings has a switch: counting must not be turned off from the app');
    if ((await page.getByText(/count my screen time/i).count()) > 0) throw new Error('Settings still offers to stop counting');
    // A test build keeps one button for it among its tools (the preview's stand-in phone can't be turned off, so it is only looked for).
    await see(page, 'Turn counting off (test)');
    await context.close();
  });

  for (const [problem, words] of [
    ['accessOff', 'Screen Time access for Plainlimit was turned off'],
    ['notRegistered', 'The phone stopped counting'],
    ['miscounted', 'The phone miscounted today'],
  ]) {
    await scenario(`the "${problem}" card reads well and its button answers`, async () => {
      const { page, context } = await open(doc({ used: 40 }), `?mock=counting,${problem}`);
      await see(page, 'Not counting');
      await see(page, words);
      await shot(page, `q04-problem-${problem}`);
      // Pressing the fix shows its answer, or goes to Essentials, and never hangs on "One moment…".
      const button = page.getByRole('button').filter({ hasText: /Set essentials|Turn it back on|Count again/ }).first();
      await button.click();
      await page.waitForTimeout(700);
      if ((await page.getByText('One moment…').count()) > 0) throw new Error('the button stayed on "One moment…"');
      await shot(page, `q04-problem-${problem}-after`);
      await context.close();
    });
  }

  await scenario('essentials never chosen: everything counts, Today offers them, and nothing reads as a problem', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting,noEssentials');
    // Counting works without them, so there is no warning; an offer instead.
    if ((await page.getByText('Not counting').count()) > 0) throw new Error('Today called essentials not being chosen a counting problem');
    await see(page, 'Pick your essential apps');
    await see(page, 'They never count and never lock. Until you choose, every app uses your battery.');
    if (await page.getByRole('button', { name: 'Choose essentials', exact: true }).isDisabled()) throw new Error('"Choose essentials" is not open');
    await shot(page, 'q04b-no-essentials-today');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: 'Essentials, Not chosen', exact: true }).click();
    // (Today's card, still drawn behind this screen, ends with the same words.)
    await page.getByText('Until you choose, every app uses your battery.', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    // Apple's list opens once, for the essentials alone: nothing asks for "All Apps" any more.
    await see(page, 'Tick what stays open');
    await see(page, 'Codes');
    await see(page, 'Everything else uses your battery');
    if ((await page.getByText(/All Apps|Tick All/).count()) > 0) throw new Error('the old first list is still drawn');
    if (await page.getByRole('button', { name: 'Choose essentials', exact: true }).isDisabled()) throw new Error('"Choose essentials" is not open');
    await shot(page, 'q04c-no-essentials-screen');
    await context.close();
  });

  await scenario('with an empty battery and no essentials chosen, the offer is still open: the first choice is at once', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 180 }), '?mock=counting,noEssentials');
    await see(page, 'Empty');
    await see(page, 'Pick your essential apps');
    if (await page.getByRole('button', { name: 'Choose essentials', exact: true }).isDisabled()) throw new Error('"Choose essentials" is closed on an empty battery');
    await shot(page, 'q04d-no-essentials-empty');
    await context.close();
  });

  await scenario('essentials chosen: Today makes no offer', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting');
    await see(page, 'Plenty left');
    if ((await page.getByText('Pick your essential apps').count()) > 0) throw new Error('Today offered essentials that are already chosen');
    await context.close();
  });

  await scenario('setup has nothing to pick: straight from the story to notifications', async () => {
    const { page, context } = await open(null, '?mock=counting,noEssentials');
    await see(page, 'Your screen time is a battery');
    // The test builds' two drafts are gone (the owner kept this one): no switch on the first screen.
    if ((await page.getByText(/Test build\. Setup/).count()) > 0) throw new Error('setup still offers a second draft');
    await shot(page, 'q04e-setup-welcome');
    // The story's three screens (what it is, what is not counted, when it comes back), each a tap.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await see(page, 'Your essential apps don\'t count');
    await shot(page, 'q04f-setup-free');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await see(page, 'Full again every morning');
    await shot(page, 'q04g-setup-morning');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await see(page, 'Notifications need to be on');
    await page.getByLabel('Step 4 of 6', { exact: true }).waitFor();
    if ((await page.getByText('Your essentials', { exact: true }).count()) > 0) throw new Error('setup asked for essentials');
    await context.close();
  });

  await scenario('a small phone fits a counting problem', async () => {
    const { page, context } = await open(doc({ used: 40 }), '?mock=counting,accessOff', SMALL);
    await see(page, 'Not counting');
    await shot(page, 'q05-small-problem');
    await context.close();
  });

  await scenario('notifications off: Today says so, and says nothing while they are on', async () => {
    const off = await open(doc({ used: 40 }), '?mock=counting,noticesOff');
    await off.page.getByRole('button', { name: 'Notifications are off. Asking for more time won’t work. Opens Settings.', exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    await shot(off.page, 'q05a-notices-off');
    // The tap leads to the iPhone's Settings; in a browser there is nowhere to go, and the page stays as it is.
    await off.page.getByRole('button', { name: /^Notifications are off/ }).click();
    await see(off.page, 'Notifications are off');
    await off.context.close();
    const on = await open(doc({ used: 40 }), '?mock=counting');
    await see(on.page, 'used of');
    await on.page.waitForTimeout(500);
    if ((await on.page.getByText('Notifications are off').count()) > 0) throw new Error('the warning shows while notifications are not off');
    await on.context.close();
  });

  await scenario('locks held past the goal: nothing locks, settings stay open', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 240, uncounted: true }), '?mock=counting,held');
    await see(page, 'Nothing locks until');
    await shot(page, 'q06-held-today');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: 'More time', exact: true }).click();
    // Exactly "3:15": Today, out of view behind this tab, also says "of 3:15".
    await page.getByText('3:15', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q07-held-settings');
    await context.close();
  });

  await scenario('nearly out, a higher goal waits for the recharge, and the goal cannot be lowered past what is used', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 170 }), '?mock=counting');
    await see(page, 'Nearly out');
    await tab(page, 'Settings');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'More time', exact: true }).click();
    // The stepper shows the goal chosen; today keeps its own, and says when the new one starts.
    await page.getByLabel(/^Daily goal, 4:00, starts (today|tomorrow) at 6:00 AM$/).waitFor({ state: 'visible', timeout: 8000 });
    // The day is named: tomorrow, or today when this runs in the small hours before the recharge.
    await page.getByLabel(/^Today stays at 3:00\. 4:00 starts (today|tomorrow) at 6:00 AM\.$/).waitFor({ state: 'visible', timeout: 8000 });
    if ((await page.getByText('Your first day: changes start now', { exact: true }).count()) !== 0) throw new Error('the first day\'s note shows on a later day');
    await shot(page, 'q27-goal-waits');
    await tab(page, 'Today');
    await see(page, 'Nearly out');
    await see(page, 'used of 3:00');
    await tab(page, 'Settings');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Less time', exact: true }).click();
    await page.getByLabel('Daily goal, 3:00').waitFor({ state: 'visible', timeout: 8000 });
    if ((await page.getByText('from 6:00 AM', { exact: true }).count()) !== 0) throw new Error('the waiting goal stayed after going back down');
    // 2:45 would empty the battery at 2:50 used, and lock the settings with no way back.
    if (!(await page.getByRole('button', { name: 'Less time', exact: true }).isDisabled())) throw new Error('"Less time" is open with 2:50 of 3:00 used');
    await context.close();
  });

  await scenario('lowering the goal mid-day is at once, and so is going back up to the day\'s own goal', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting');
    await tab(page, 'Settings');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Less time', exact: true }).click();
    await page.getByLabel('Daily goal, 2:30').waitFor({ state: 'visible', timeout: 8000 });
    await tab(page, 'Today');
    await see(page, 'used of 2:30');
    await tab(page, 'Settings');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'More time', exact: true }).click();
    await page.getByLabel('Daily goal, 3:00').waitFor({ state: 'visible', timeout: 8000 });
    if ((await page.getByText('from 6:00 AM', { exact: true }).count()) !== 0) throw new Error('going back up to the day\'s own goal waited for the recharge');
    await page.getByRole('button', { name: 'More time', exact: true }).click();
    await page.getByLabel(/^Daily goal, 3:15, starts (today|tomorrow) at 6:00 AM$/).waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q28-goal-back-up');
    await context.close();
  });

  await scenario('with Pro, a new recharge time waits for this battery: later runs it on, earlier recharges once more first', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 120 }), '?mock=counting');
    // The recharge time has a tile in Settings, under "Do more".
    const advanced = async () => {
      await tab(page, 'Settings');
      await page.getByRole('button', { name: /^Recharge time, / }).click();
    };
    const today = async () => {
      await page.goBack();
      await tab(page, 'Today');
    };
    await advanced();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Recharge later', exact: true }).click();
    await page.getByLabel('Recharges at 8:00 AM, after this battery').waitFor({ state: 'visible', timeout: 8000 });
    await see(page, 'This battery runs on until 8:00 AM.');
    await shot(page, 'q29-recharge-later', true);
    await today();
    await see(page, 'Recharges at 8:00 AM');
    await advanced();
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Recharge earlier', exact: true }).click();
    await page.getByLabel('Recharges at 4:00 AM, after this battery').waitFor({ state: 'visible', timeout: 8000 });
    await see(page, 'One more recharge at 6:00 AM, then at 4:00 AM.');
    await today();
    await see(page, 'Recharges at 6:00 AM');
    // Back to today's time: nothing waits.
    await advanced();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Recharge later', exact: true }).click();
    await page.getByLabel('Recharges at 6:00 AM', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    await context.close();
  });

  await scenario('an empty battery locks the settings and Essentials', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 180 }), '?mock=counting');
    await see(page, 'Empty');
    await shot(page, 'q08-empty-today');
    await tab(page, 'Settings');
    await see(page, 'these settings are locked until it recharges');
    // Locked controls look and act locked, rather than ignoring taps.
    for (const name of ['More time', 'Less time']) {
      if (!(await page.getByRole('button', { name, exact: true }).isDisabled())) throw new Error(`"${name}" is not disabled while locked`);
    }
    for (const name of [/^Warn/, /^Work for it/, /^Locked/]) {
      if (!(await page.getByRole('radio', { name }).isDisabled())) throw new Error(`${name} is not disabled while locked`);
    }
    await shot(page, 'q09-empty-settings');
    await page.getByRole('button', { name: /^Recharge time, / }).click();
    for (const name of ['Recharge earlier', 'Recharge later']) {
      if (!(await page.getByRole('button', { name, exact: true }).isDisabled())) throw new Error(`"${name}" is not disabled while locked`);
    }
    await shot(page, 'q09b-empty-recharge-time');
    await page.goBack();
    await page.getByRole('button', { name: /^Essentials/ }).click();
    await see(page, 'Locked while the battery is empty');
    await page.getByLabel('Always open: 14 essential apps, never counted.', { exact: true }).waitFor();
    if ((await page.getByRole('button', { name: 'Change essentials', exact: true }).count()) > 0) throw new Error('Essentials offered "Change essentials" while empty');
    await shot(page, 'q10-empty-what-counts');
    await context.close();
  });

  await scenario('Essentials with cells left offers a change', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: 'Essentials, 14 apps', exact: true }).click();
    await page.getByLabel('Always open: 14 essential apps, never counted.', { exact: true }).waitFor();
    await page.getByLabel('Your essential apps', { exact: true }).waitFor();
    await page.getByLabel('Everything else uses your battery.', { exact: true }).waitFor();
    // (Exactly: the Settings row behind this screen now ends "never counted" too.)
    await page.getByText('Never counted', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
    await see(page, 'Uses your battery');
    await page.getByRole('button', { name: 'Change essentials', exact: true }).waitFor();
    // Every other app counts without being shown to Plainlimit: there is no list of them to refresh.
    if ((await page.getByRole('button', { name: 'Refresh the app list', exact: true }).count()) > 0) throw new Error('Essentials still offers to refresh a list of apps');
    // Nothing waits for the recharge, so no card says so.
    if ((await page.getByText(/^Joining/).count()) > 0) throw new Error('Essentials showed apps joining with none waiting');
    await shot(page, 'q10b-what-counts-open');
    await context.close();
  });

  await scenario('new essentials wait for the recharge: a card of their own, and a word on the Settings row', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting,essentialsWaiting');
    await tab(page, 'Settings');
    // "tomorrow", or the time itself in the small hours before the recharge.
    await page.getByRole('button', { name: /^Essentials, 14 apps, 2 more (tomorrow|at 6:00 AM)$/ }).click();
    await page.getByLabel(/^2 apps become essentials (tomorrow )?at 6:00 AM\. They are counted until then\.$/).waitFor();
    await page.getByLabel('The apps that become essentials', { exact: true }).waitFor();
    await page.getByText(/^Joining (tomorrow|at 6:00 AM)$/).first().waitFor();
    await page.getByText(/^Counted until (6:00 AM|then)$/).first().waitFor();
    // They wait: today's essentials are the same 14, and the rest still use the battery.
    await page.getByLabel('Always open: 14 essential apps, never counted.', { exact: true }).waitFor();
    await page.getByLabel('Everything else uses your battery.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Change essentials', exact: true }).waitFor();
    await shot(page, 'q10c-what-counts-waiting', true);
    await context.close();
  });

  await scenario('earned time running shows when it ends', async () => {
    const until = new Date(Date.now() + 12 * 60 * 1000).toISOString();
    const { page, context } = await open(doc({ goal: 180, used: 190, topUps: 1, unlockedUntil: until }), '?mock=counting');
    await see(page, 'Earned time');
    await shot(page, 'q11-earned-time');
    await context.close();
  });

  await scenario('a week of every kind of day', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60, history: mixedWeek(180, 360) }));
    await shot(page, 'q12-week-mixed');
    await page.getByRole('button', { name: /^History/ }).click();
    await page.getByText(/days? without an emergency pass$/).first().waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q12b-week-mixed-history', true);
    await context.close();
  });

  await scenario('without Pro, a recharge time chosen in 1.0 stays, and a Second thought left on reads Off and can\'t be switched', async () => {
    const saved = doc({ recharge: 420, used: 20 });
    saved.settings.askFirst = { on: true, openMinutes: 10 };
    const { page, context } = await open(saved, '', PHONE, { withPro: false });
    await tab(page, 'Settings');
    await page.getByRole('button', { name: 'Recharge time, 7:00 AM, Pro', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sums, Normal, Pro', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Second thought, Off, Pro', exact: true }).waitFor();
    if ((await page.getByRole('button', { name: 'Recharge later', exact: true }).count()) > 0) throw new Error('the recharge stepper shows without Pro');
    await shot(page, 'q20-free-settings', true);
    await page.getByRole('button', { name: 'Second thought, Off, Pro', exact: true }).click();
    await see(page, 'Second thought is part of Plainlimit Pro.');
    if ((await page.getByRole('switch', { name: 'Second thought' }).count()) > 0) throw new Error('the Second thought switch shows without Pro');
    await shot(page, 'q20a-free-second-thought', true);
    await page.goBack();
    await page.getByRole('button', { name: /^Plainlimit Pro/ }).click();
    await page.getByTestId('pro-screen').waitFor();
    await shot(page, 'q21-pro-screen');
    await context.close();
  });

  await scenario('the Pro screen opened on its own (from the widget) can be closed, and lands on Today', async () => {
    const { page, context } = await open(doc({ used: 20 }), '', PHONE, { withPro: false });
    await page.goto(page.url().replace(/\/?(\?.*)?$/, '/pro'));
    await see(page, 'Plainlimit Pro');
    await page.getByRole('button', { name: 'Not now', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await see(page, 'used of 3:00');
    await context.close();
  });

  await scenario('the shortest goal and a midnight recharge', async () => {
    const { page, context } = await open(doc({ goal: 30, recharge: 0, used: 12 }));
    await see(page, 'used of 0:30');
    await see(page, 'Recharges at 12:00 AM');
    await shot(page, 'q13-goal-30-midnight');
    await context.close();
  });

  await scenario('the longest goal and an 11:30 PM recharge', async () => {
    const { page, context } = await open(doc({ goal: 720, recharge: 1410, used: 700 }));
    await see(page, 'used of 12:00');
    await see(page, 'Recharges at 11:30 PM');
    await shot(page, 'q14-goal-12h-late');
    await tab(page, 'Settings');
    await page.getByText('12:00', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q15-goal-12h-settings');
    await context.close();
  });

  await scenario('far past the goal with many top-ups stays tidy', async () => {
    const { page, context } = await open(doc({ goal: 60, used: 600, topUps: 9 }));
    await see(page, 'Empty');
    await shot(page, 'q16-far-past');
    await context.close();
  });

  await scenario('broken saved data still opens the app', async () => {
    for (const [name, saved] of [
      ['not-json', '{this is not json'],
      ['wrong-types', JSON.stringify({ v: 1, settings: { goalMinutes: 'lots', rechargeMinute: -5, emptyLevel: 'nope' }, day: { usedMinutes: null }, history: 'none', setupDone: true })],
      ['future-day', JSON.stringify(doc({ used: 30 })).replace(/"periodStart":"[^"]+"/, '"periodStart":"2099-01-01T06:00:00.000Z"')],
      ['empty-object', '{}'],
    ]) {
      const { page, context } = await open(saved);
      // Either setup (nothing usable was saved) or Today: never a blank screen.
      await page.getByText(/Your screen time is a battery|Plenty left|Today/).first().waitFor({ state: 'visible', timeout: 8000 });
      await shot(page, `q17-broken-${name}`);
      await context.close();
    }
  });

  await scenario('wrong sums are told apart from right ones', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 200 }));
    await page.getByRole('button', { name: /Solve 3 sums/ }).click();
    await see(page, 'Sum 1 of 3');
    await shot(page, 'q18-puzzle');
    const input = page.getByRole('textbox').first();
    await input.fill('99999');
    await see(page, 'Not 9999. Try again.');
    await shot(page, 'q19-puzzle-wrong');
    await context.close();
  });

  await scenario('Second thought: the switch comes first and says On or Off, the open time second; nothing picked shows off with one button; with apps the switch turns it on, and the picture follows the open choice, "Until I leave it" among them', async () => {
    {
      const { page, context } = await open(doc({ goal: 180, used: 40 }), '?mock=counting,noAskPicks');
      await tab(page, 'Settings');
      await page.getByRole('button', { name: 'Second thought, Off', exact: true }).click();
      await see(page, 'A pause before the apps you open without thinking.');
      await see(page, 'Pick apps and it turns on');
      await page.getByRole('button', { name: 'Choose apps', exact: true }).waitFor();
      // The button sits with the switch too, above the open time.
      const chooseAt = (await page.getByRole('button', { name: 'Choose apps', exact: true }).boundingBox()).y;
      const firstTimeAt = (await page.getByRole('radio', { name: '5 minutes', exact: true }).boundingBox()).y;
      if (!(chooseAt < firstTimeAt)) throw new Error(`"Choose apps" is not above the open time (${chooseAt}, ${firstTimeAt})`);
      if (await page.getByRole('switch', { name: 'Second thought' }).isChecked()) throw new Error('the switch was on with nothing picked');
      await page.getByTestId('ask-state').filter({ hasText: /^Off$/ }).waitFor();
      await shot(page, 'q21a-ask-first-nothing-picked', true);
      await context.close();
    }
    const { page, context } = await open(doc({ goal: 180, used: 40 }), '?mock=counting');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: /^Second thought/ }).click();
    // "Until I leave it" is the open time someone starts with (the owner, 2026-11-22), and the picture says so.
    await page.getByRole('img', { name: 'Your app asks first. Solve one sum. It stays open until you leave it, then it asks again.', exact: true }).waitFor();
    if (!(await page.getByRole('radio', { name: 'Until I leave it', exact: true }).isChecked())) throw new Error('"Until I leave it" is not the open time to start with');
    await page.getByRole('button', { name: 'Your apps, 3 picked', exact: true }).waitFor();
    // The phone's list of apps opened first after a pickup: here only its box, waiting for the phone.
    await see(page, 'You open these first');
    await see(page, 'After picking up your phone, last 7 days.');
    const toggle = page.getByRole('switch', { name: 'Second thought' });
    if (await toggle.isChecked()) throw new Error('Second thought was not off by default');
    await see(page, 'Apps open as usual');
    // The switch is the first thing on the page: above the picture and the apps (the owner, 2026-11-22).
    const switchAt = (await toggle.boundingBox()).y;
    const pictureAt = (await page.getByRole('img', { name: /^Your app asks first/ }).boundingBox()).y;
    const appsAt = (await page.getByRole('button', { name: 'Your apps, 3 picked', exact: true }).boundingBox()).y;
    if (!(switchAt < pictureAt)) throw new Error(`the switch is not above the picture (${switchAt}, ${pictureAt})`);
    // The open time comes second, under the switch and above the picture, so it shows as the screen opens (the owner, 2026-11-22).
    const timesAt = (await page.getByRole('radio', { name: '5 minutes', exact: true }).boundingBox()).y;
    if (!(switchAt < timesAt && timesAt < pictureAt)) throw new Error(`the open time is not between the switch and the picture (${switchAt}, ${timesAt}, ${pictureAt})`);
    // "Your apps" sits with the switch, in the first card, not at the foot of the page (the owner, after build 145).
    if (!(switchAt < appsAt && appsAt < timesAt)) throw new Error(`"Your apps" is not between the switch and the open time (${switchAt}, ${appsAt}, ${timesAt})`);
    await toggle.click();
    await page.waitForTimeout(200);
    if (!(await toggle.isChecked())) throw new Error('the switch did not turn it on');
    await see(page, '3 apps ask first');
    await page.getByTestId('ask-state').filter({ hasText: /^On$/ }).waitFor();
    await page.getByRole('radio', { name: '15 minutes', exact: true }).click();
    if (!(await page.getByRole('radio', { name: '15 minutes', exact: true }).isChecked())) throw new Error('15 minutes did not stay chosen');
    await page.getByRole('img', { name: 'Your app asks first. Solve one sum. It opens for 15 minutes, then it asks again.', exact: true }).waitFor();
    await see(page, 'Open 15 min, then it asks again');
    await see(page, 'One sum, then your app opens for 15 minutes.');
    await shot(page, 'q21-ask-first-settings', true);
    // The fourth choice: open for as long as the app is used, and it says what that means.
    if ((await page.getByRole('radio').count()) !== 4) throw new Error('expected four open choices');
    const whileUsed = page.getByRole('radio', { name: 'Until I leave it', exact: true });
    await whileUsed.click();
    if (!(await whileUsed.isChecked())) throw new Error('"Until I leave it" did not stay chosen');
    if (await page.getByRole('radio', { name: '15 minutes', exact: true }).isChecked()) throw new Error('15 minutes stayed chosen beside "Until I leave it"');
    await page.getByRole('img', { name: 'Your app asks first. Solve one sum. It stays open until you leave it, then it asks again.', exact: true }).waitFor();
    await see(page, 'Open until you leave it, then it asks again');
    await see(page, 'One sum, then your app stays open until you leave it.');
    await see(page, 'Stays open until you leave the app. Asks again about 2 minutes after you leave.');
    // It sits on a row of its own under the three times.
    const wide = await whileUsed.boundingBox();
    const five = await page.getByRole('radio', { name: '5 minutes', exact: true }).boundingBox();
    if (!(wide.y > five.y + five.height - 1 && wide.width > five.width * 2)) throw new Error('"Until I leave it" is not on its own row under the times');
    // All four choices, and the line under them, are on the first screen: nothing to scroll for.
    const said = await page.getByText('Stays open until you leave the app.', { exact: false }).boundingBox();
    const tall = page.viewportSize().height;
    if (!(said.y + said.height < tall)) throw new Error(`the open time runs off the first screen (${said.y + said.height} of ${tall})`);
    await shot(page, 'q21b-ask-first-while-in-use', true);
    await page.goBack();
    await see(page, 'On, until I leave it');
    await shot(page, 'q21c-settings-tile-until-i-leave-it', true);
    await page.getByRole('button', { name: /^Second thought/ }).click();
    await page.getByRole('radio', { name: '15 minutes', exact: true }).click();
    await page.getByRole('img', { name: 'Your app asks first. Solve one sum. It opens for 15 minutes, then it asks again.', exact: true }).waitFor();
    await page.goBack();
    await see(page, 'On, 15 min');
    // Not closed while the battery is empty: it can't open an app that counts.
    await context.close();
  });

  await scenario('Second thought: the right answer opens the list by itself, a wrong one is said at once, and an empty battery is said', async () => {
    const saved = doc({ goal: 180, used: 200 });
    const { page, context } = await open(saved, '?mock=counting');
    await see(page, 'Empty');
    await page.goto(url.replace(/\/$/, '') + '/ask?mock=counting');
    await see(page, 'One sum to open');
    await see(page, 'Apps that also count stay locked');
    await shot(page, 'q22a-ask-sum');
    const input = page.getByRole('textbox').first();
    const sum = await page.getByText(/^\s*\d+\s*\+\s*\d+\s*$/).first().textContent();
    const [, a, b] = sum.match(/(\d+)\s*\+\s*(\d+)/);
    const answer = String(Number(a) + Number(b));
    // One digit is not an answer yet; Open turns it down.
    await input.fill('1');
    if ((await page.getByText('Try again', { exact: false }).count()) > 0) throw new Error('one digit was called wrong');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await see(page, 'Not 1. Try again.');
    // A miss as long as the answer is said at once, and the field empties for another go.
    await input.fill('99999');
    await see(page, 'Not 9999. Try again.');
    if ((await input.inputValue()) !== '') throw new Error('a wrong answer stayed in the field');
    // The right answer opens by itself, a key at a time: no button to find.
    await input.pressSequentially(answer);
    await see(page, 'open until');
    await shot(page, 'q22-ask-open');
    await context.close();
  });

  await scenario('Second thought with "Until I leave it": the sum says the apps stay open until they are left, and no end time is promised', async () => {
    const saved = doc({ goal: 180, used: 40 });
    saved.settings.askFirst = { on: true, openMinutes: 10, whileInUse: true };
    const { page, context } = await open(saved, '?mock=counting');
    await page.goto(url.replace(/\/$/, '') + '/ask?mock=counting');
    await see(page, 'One sum to open');
    await see(page, 'Your Second thought apps stay open until you leave them, then ask again.');
    const sum = await page.getByText(/^\s*\d+\s*\+\s*\d+\s*$/).first().textContent();
    const [, a, b] = sum.match(/(\d+)\s*\+\s*(\d+)/);
    await page.getByRole('textbox').first().pressSequentially(String(Number(a) + Number(b)));
    await see(page, 'Open until you leave it');
    await see(page, 'ask again about 2 minutes after you leave');
    if ((await page.getByText('are open until', { exact: false }).count()) > 0) throw new Error('an end time was promised for "Until I leave it"');
    await shot(page, 'q22b-ask-open-while-in-use');
    await context.close();
  });

  await scenario('After a Second thought sum the person goes back to the app themselves: a plain Open, then Done, and no app is opened from here', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 40 }), '?mock=counting');
    await page.goto(url.replace(/\/$/, '') + '/ask?mock=counting');
    await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
    const sum = await page.getByText(/^\s*\d+\s*\+\s*\d+\s*$/).first().textContent();
    const [, a, b] = sum.match(/(\d+)\s*\+\s*(\d+)/);
    await page.getByRole('textbox').first().pressSequentially(String(Number(a) + Number(b)));
    await see(page, 'Go back to the one you wanted.');
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor();
    if ((await page.getByRole('button', { name: /^Open / }).count()) > 0) throw new Error('an app was offered to open');
    await context.close();
  });

  await scenario('emergency pass: offered on an empty battery, opens everything and the settings, once a day; the record opens from Today', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 200, level: 'locked' }), '?mock=counting');
    await see(page, 'Empty');
    // Red, with what it costs, under the empty battery.
    await page.getByRole('button', { name: /^Emergency pass, 1 saved\. 15 min/ }).waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q23a-pass-row-empty');
    await page.getByRole('button', { name: /^Emergency pass/ }).click();
    await see(page, 'Use an emergency pass?');
    await see(page, 'Passes left after this');
    await shot(page, 'q23-pass-sheet');
    await page.getByRole('button', { name: 'Open everything for 15 minutes', exact: true }).click();
    // Anchored: Today, hidden under the sheet, also says "everything is open until".
    await page.getByText(/^Open until \d/).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await see(page, 'Emergency pass: everything is open');
    if ((await page.getByRole('button', { name: /^Emergency pass/ }).count()) > 0) throw new Error('a second pass was offered the same day');
    // The pass stays on Today as a grey row that says why it can't be used.
    await page.getByLabel('Emergency pass, 0 saved. Open now', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
    await tab(page, 'Settings');
    if (await page.getByRole('button', { name: 'More time', exact: true }).isDisabled()) throw new Error('settings stayed locked during the pass');
    // During a pass more time starts today, without waiting for the recharge (goal.ts).
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'More time', exact: true }).click();
    await see(page, 'Emergency pass: more time starts today');
    await page.getByLabel('Daily goal, 3:45', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    if ((await page.getByText('Today keeps its goal.').count()) > 0) throw new Error('the higher goal waited for tomorrow during a pass');
    await shot(page, 'q23b-pass-goal-today');
    // 25 minutes of battery outlast the pass: the battery takes over, and the settings stay open to the pass's end.
    await page.waitForTimeout(3000);
    await tab(page, 'Today');
    await see(page, 'Emergency pass: settings are open until');
    if ((await page.getByText(/^Empty$/).count()) > 0) throw new Error('the battery stayed empty after the goal went up');
    await shot(page, 'q23c-pass-battery-takes-over');
    // Today's streak, beside the day's figure, is 0 on the day a pass was used, and says when it starts again.
    await page.getByRole('button', { name: '0 day streak, starts again tomorrow', exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    await page.getByRole('button', { name: /^History/ }).click();
    // The pass just used ends the streak, and its day wears the mark.
    await see(page, 'A pass was used today. A new streak starts tomorrow.');
    await see(page, 'Emergency passes');
    await shot(page, 'q24-record', true);
    await context.close();
  });

  await scenario('a lived-in record: ten weeks of days, passes used, and the pass days marked on Today; settings locked after the day\'s pass is used', async () => {
    const recharge = 360;
    const today = periodStart(recharge);
    const history = [];
    for (let k = 70; k >= 1; k--) {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k, 6, 0);
      const f = [0.5, 0.8, 0.6, 1.2, 0.4, 0.9, 0.7][k % 7];
      history.push({ start: start.toISOString(), goalMinutes: 180, usedMinutes: Math.round(180 * f), topUps: f > 1 ? 1 : 0, state: 'counted' });
    }
    const at = (daysAgo, h) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, h, 0).toISOString();
    const saved = {
      ...doc({ goal: 180, used: 200, level: 'locked', recharge, history }),
      record: { passes: 3, lastAdded: '2000-01-03', since: at(80, 9), uses: [at(40, 21), at(3, 22), at(0, 7)], passUntil: null },
    };
    // lastAdded far back would add passes; keep it on this week instead.
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    saved.record.lastAdded = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const { page, context } = await open(saved, '?mock=counting');
    await see(page, 'Empty');
    if ((await page.getByRole('button', { name: /^Emergency pass/ }).count()) > 0) throw new Error('a pass was offered after one was used today');
    await shot(page, 'q25-today-pass-days', true);
    await tab(page, 'Settings');
    await see(page, 'emergency pass has been used');
    if ((await page.getByText('opens them for 15 minutes').count()) > 0) throw new Error('the locked notice offered a pass that cannot be used');
    await tab(page, 'Today');
    await page.getByRole('button', { name: /^History/ }).click();
    // Passes were used 40 days ago, 3 days ago and today: no streak today, and the 40 days before the first are the best run.
    await see(page, 'A pass was used today. A new streak starts tomorrow.');
    await see(page, 'Your best: 40 days');
    await page.getByRole('img', { name: /Passes used on 2 days\.$/ }).waitFor({ state: 'visible', timeout: 8000 });
    await shot(page, 'q26-record-lived-in', true);
    await context.close();
  });

  await scenario('an unknown page offers a way back', async () => {
    const { page, context } = await open(doc(), '');
    await page.goto(url.replace(/\/$/, '') + '/nowhere/at/all');
    await page.waitForTimeout(1200);
    await shot(page, 'q20-not-found');
    await context.close();
  });

  await browser.close();
  server.close();
  console.log(`\nPictures: ${SHOTS}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`All ${count} scenarios ran with no console errors.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
