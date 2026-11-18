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
  async function open(saved, query = '', size = PHONE) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'dark', locale: 'en-US' });
    await context.addInitScript(
      ([key, value]) => {
        if (value !== null) window.localStorage.setItem(key, value);
      },
      [KEY, saved === null ? null : typeof saved === 'string' ? saved : JSON.stringify(saved)],
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
    await see(page, 'of 4:30, in apps that count');
    await shot(page, 'q01-counting-top');
    await toBottom(page);
    await see(page, 'Waiting for the phone');
    await shot(page, 'q02-counting-bottom');
    await tab(page, 'Settings');
    await see(page, 'On. The battery follows');
    await shot(page, 'q03-counting-settings');
    await context.close();
  });

  for (const [problem, words] of [
    ['nothingPicked', 'Your essentials aren’t set yet'],
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
      const button = page.getByRole('button').filter({ hasText: /Choose apps|Turn it back on|Count again/ }).first();
      await button.click();
      await page.waitForTimeout(700);
      if ((await page.getByText('One moment…').count()) > 0) throw new Error('the button stayed on "One moment…"');
      await shot(page, `q04-problem-${problem}-after`);
      await context.close();
    });
  }

  await scenario('too many single apps: Today says so, and Essentials opens to pick again even while empty', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 180 }), '?mock=counting,tooManyApps');
    await see(page, 'Not locking');
    await see(page, 'More than 500 apps are ticked one by one');
    await shot(page, 'q04b-too-many-today');
    await page.getByRole('button', { name: 'Pick again', exact: true }).click();
    await see(page, '540 apps are ticked one by one, and iOS locks at most 500');
    await page.getByRole('button', { name: 'Pick again', exact: true }).waitFor();
    await shot(page, 'q04c-too-many-what-counts');
    await context.close();
  });

  await scenario('a small phone fits a counting problem', async () => {
    const { page, context } = await open(doc({ used: 40 }), '?mock=counting,accessOff', SMALL);
    await see(page, 'Not counting');
    await shot(page, 'q05-small-problem');
    await context.close();
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

  await scenario('an empty battery locks the settings and Essentials', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 180 }), '?mock=counting');
    await see(page, 'Empty');
    await shot(page, 'q08-empty-today');
    await tab(page, 'Settings');
    await see(page, 'these settings are locked until it recharges');
    // Locked controls look and act locked, rather than ignoring taps.
    for (const name of ['More time', 'Less time', 'Recharge earlier', 'Recharge later']) {
      if (!(await page.getByRole('button', { name, exact: true }).isDisabled())) throw new Error(`"${name}" is not disabled while locked`);
    }
    for (const name of [/^Warn/, /^Work for it/, /^Locked/]) {
      if (!(await page.getByRole('radio', { name }).isDisabled())) throw new Error(`${name} is not disabled while locked`);
    }
    await shot(page, 'q09-empty-settings');
    await page.getByRole('button', { name: /^Essentials/ }).click();
    await see(page, "This can't change while the battery is empty");
    if ((await page.getByRole('button', { name: 'Change the apps', exact: true }).count()) > 0) throw new Error('Essentials offered a change while empty');
    await shot(page, 'q10-empty-what-counts');
    await context.close();
  });

  await scenario('Essentials with cells left offers a change', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 60 }), '?mock=counting');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: 'Essentials, 14 count', exact: true }).click();
    await page.getByRole('button', { name: 'Change the apps', exact: true }).waitFor();
    await shot(page, 'q10b-what-counts-open');
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
    await toBottom(page);
    await see(page, 'Last 7 days');
    await shot(page, 'q12-week-mixed');
    await context.close();
  });

  await scenario('the shortest goal and a midnight recharge', async () => {
    const { page, context } = await open(doc({ goal: 30, recharge: 0, used: 12 }));
    await see(page, '30 minute day');
    await see(page, 'Recharges at 12:00 AM');
    await shot(page, 'q13-goal-30-midnight');
    await context.close();
  });

  await scenario('the longest goal and an 11:30 PM recharge', async () => {
    const { page, context } = await open(doc({ goal: 720, recharge: 1410, used: 700 }));
    await see(page, '12 hour day');
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
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await shot(page, 'q19-puzzle-wrong');
    await context.close();
  });

  await scenario('Second thought: off by default, turned on from Settings, open time chosen', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 40 }), '?mock=counting');
    await tab(page, 'Settings');
    await page.getByRole('button', { name: /^Second thought/ }).click();
    await see(page, 'asks for one sum before it opens');
    if (!(await page.getByRole('radio', { name: /^Off/ }).isChecked())) throw new Error('Second thought was not off by default');
    await page.getByRole('radio', { name: /^On/ }).click();
    await page.getByRole('radio', { name: /^15 minutes/ }).click();
    if (!(await page.getByRole('radio', { name: /^15 minutes/ }).isChecked())) throw new Error('15 minutes did not stay chosen');
    await see(page, '3 picked');
    await shot(page, 'q21-ask-first-settings', true);
    await page.goBack();
    await see(page, 'On, 15 min');
    // Not closed while the battery is empty: it can't open an app that counts.
    await context.close();
  });

  await scenario('Second thought: one sum opens the list, a wrong answer is told apart, and an empty battery is said', async () => {
    const saved = doc({ goal: 180, used: 200 });
    const { page, context } = await open(saved, '?mock=counting');
    await see(page, 'Empty');
    await page.goto(url.replace(/\/$/, '') + '/ask?mock=counting');
    await see(page, 'One sum to open');
    await see(page, 'Apps that also count stay locked');
    await shot(page, 'q22a-ask-sum');
    const input = page.getByRole('textbox').first();
    await input.fill('99999');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await see(page, 'Not 9999');
    const sum = await page.getByText(/^\s*\d+\s*\+\s*\d+\s*$/).first().textContent();
    const [, a, b] = sum.match(/(\d+)\s*\+\s*(\d+)/);
    await input.fill(String(Number(a) + Number(b)));
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await see(page, 'open until');
    await shot(page, 'q22-ask-open');
    await context.close();
  });

  await scenario('emergency pass: offered on an empty battery, opens everything and the settings, once a day; the record opens from Today', async () => {
    const { page, context } = await open(doc({ goal: 180, used: 200, level: 'locked' }), '?mock=counting');
    await see(page, 'Empty');
    await page.getByRole('button', { name: /^Use an emergency pass/ }).click();
    await see(page, 'Use an emergency pass?');
    await see(page, 'Passes left after this');
    await shot(page, 'q23-pass-sheet');
    await page.getByRole('button', { name: 'Open everything for 15 minutes', exact: true }).click();
    // Anchored: Today, hidden under the sheet, also says "everything is open until".
    await page.getByText(/^Open until \d/).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await see(page, 'Emergency pass: everything is open');
    if ((await page.getByRole('button', { name: /^Use an emergency pass/ }).count()) > 0) throw new Error('a second pass was offered the same day');
    await tab(page, 'Settings');
    if (await page.getByRole('button', { name: 'More time', exact: true }).isDisabled()) throw new Error('settings stayed locked during the pass');
    await tab(page, 'Today');
    await toBottom(page);
    await page.getByRole('button', { name: /^Your record/ }).click();
    await page.getByText(/^Last \d+ weeks$/).first().waitFor({ state: 'visible', timeout: 8000 });
    await see(page, 'Passes used');
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
    if ((await page.getByRole('button', { name: /^Use an emergency pass/ }).count()) > 0) throw new Error('a pass was offered after one was used today');
    await see(page, 'A dot marks each day you used an emergency pass.');
    await shot(page, 'q25-today-pass-days', true);
    await tab(page, 'Settings');
    await see(page, 'emergency pass has been used');
    if ((await page.getByText('opens them for 15 minutes').count()) > 0) throw new Error('the locked notice offered a pass that cannot be used');
    await tab(page, 'Today');
    await toBottom(page);
    await page.getByRole('button', { name: /^Your record/ }).click();
    await page.getByText(/^Last \d+ weeks$/).first().waitFor({ state: 'visible', timeout: 8000 });
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
