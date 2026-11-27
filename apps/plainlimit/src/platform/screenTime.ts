import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldAction, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { GUARD_MS, PICKS_QUIET_MS, guardFor, paceRules, reReportsStart, roundName, splitName, mostByNow, type Noted } from '@/domain/checkpoints';
import { countDay, doubtful, everythingCounted, keptCounted, miscounted, roundSettled, roundStanding, withFloor, type DayInput, type Report, type Rounds } from '@/domain/reports';
import { nextRecharge, periodStart as periodStartOf } from '@/domain/day';
import { essentialsAtRecharge, withEssentials, type EssentialsChange, type Lists } from '@/domain/essentials';
import { SETTLE_MS, figureSure, overRungs, type Tally } from '@/domain/tally';
import {
  ACTIVITY,
  COUNTED_ID,
  EVERYTHING,
  KEPT_ACTIVITY,
  OVER_ACTIVITY,
  TICKS_ACTIVITY,
  TOPUP_ACTIVITY,
  countStart,
  lockNotBefore,
  includesEarlierUse,
  monitorPlan,
  puzzleNotice,
  topUpWindow,
  TOO_SOON_NOTICE,
  type ButtonEffect,
  type PlanAction,
  type PlanShield,
} from '@/domain/monitorPlan';
import { refusalOf, type Refusal } from '@/domain/access';
import { ASK_ID } from '@/domain/askFirst';
import type { WidgetRecord } from '@/domain/pro';
import type { Settings } from '@/domain/types';

import { askCoverActions, coverAskAgain, stopAskFirst } from './askFirst';
import { countingSince, earnedUntil, forget, holdUntil, noted, picksChangedAt, readLines, readNumber, readNumberOrNull, readString, registeredAt, reReportsFrom, round, save, SAVED, savedFloor, savedGuard } from './saved';
import { MOCK } from './mock';

// The one file that talks to Apple's Screen Time.
//
// It works only in a build that carries the Screen Time pieces (a development
// build or a store build made by the studio's iPhone build): never in Expo Go
// and never in a browser. There, SCREEN_TIME_AVAILABLE is false, nothing in
// this file does anything, and the app runs on pretend use from Settings,
// under Developer.
//
// Tried on the owner's iPhone since build 15; NOTES.md keeps what each build
// showed, and the testing checklist what is still to check.

/** True only in a build that carries the Screen Time pieces. */
export const SCREEN_TIME_AVAILABLE = Platform.OS === 'ios' && DeviceActivity.isAvailable();

/**
 * Developer tools (pretend use, screen previews) show in dev builds, on the
 * web preview and in a "playtest" build for TestFlight, which the iPhone build
 * makes by setting EXPO_PUBLIC_PLAYTEST=1. They are never in a store build.
 */

export type Permission = 'unknown' | 'denied' | 'approved';

/**
 * Preview only: "?mock=" in the address stands in for an iPhone's Screen Time,
 * so the states only a phone reaches can be seen and checked in a browser.
 * Words, comma-separated: "counting" (counting is on), one counting problem
 * ("accessOff", "notRegistered", "miscounted"),
 * "held" (setup's "start tomorrow": nothing locks before the recharge),
 * "noEssentials" (the essentials were never chosen: everything counts),
 * "noAskPicks" (nothing picked yet for Second thought),
 * "essentialsWaiting" (two new essentials wait for the next recharge),
 * "noticesOff" (notifications turned off; read in notices.ts) and
 * "store" (the App Store screenshots: no test tools, and no box for the list
 * only a phone can draw). Never on a phone. The words are read in mock.ts.
 */

/** Preview only: the address asks to stand in for a phone that is counting. */
export const MOCK_PHONE = MOCK.has('counting');

/** Preview only: the App Store screenshots are being taken. */
export const STORE_SHOTS = MOCK.has('store');

/**
 * The Developer section, the test buttons and the readout: in development, in
 * the browser preview and in playtest builds; never in an App Store build. The
 * preview's "?mock=...,store" hides them too, for the App Store screenshots.
 */
export const DEV_TOOLS = (__DEV__ || Platform.OS === 'web' || process.env.EXPO_PUBLIC_PLAYTEST === '1') && !MOCK.has('store');

const widgets = Platform.OS === 'ios' ? requireOptionalNativeModule<{ reload(): void; build?(): string }>('PlainlimitWidgets') : null;

/** Asks iOS to redraw the home screen widget now. */
/**
 * Leaves the record and whether Pro is held where the large widget reads them,
 * as one JSON string. Redraws the widget only when what it shows has changed.
 */
let sharedRecord = '';
export function shareWithWidget(record: WidgetRecord) {
  if (!SCREEN_TIME_AVAILABLE) return;
  const text = JSON.stringify(record);
  if (text === sharedRecord) return;
  try {
    save('widgetRecord', text);
    sharedRecord = text;
    reloadWidget();
  } catch (error) {
    note('the widget record', error);
  }
}

export function reloadWidget() {
  try {
    widgets?.reload();
  } catch {
    // The widget catches up on its own within the hour.
  }
}

/**
 * What Apple's access sheet last answered in this run of the app. iOS does not
 * update its own answer for a running app when access is turned off or on in
 * the Settings app (Apple's forums; seen on build 55: "Not counting" only came
 * and went when the app was reopened), so the sheet's answer wins until then.
 */
let sheetAnswer: Permission | null = null;

export function permission(): Permission {
  if (MOCK_PHONE) return MOCK.has('accessOff') ? 'denied' : 'approved';
  if (!SCREEN_TIME_AVAILABLE) return 'unknown';
  if (sheetAnswer) return sheetAnswer;
  try {
    const status = DeviceActivity.getAuthorizationStatus();
    if (status === DeviceActivity.AuthorizationStatus.approved) return 'approved';
    if (status === DeviceActivity.AuthorizationStatus.denied) return 'denied';
  } catch {
    // Unknown is the safe answer: the app asks again.
  }
  return 'unknown';
}

/**
 * Why the last request for access was turned down (access.ts), or null when
 * it wasn't. Read after `askPermission` answers anything but "approved".
 */
let lastRefusal: Refusal | null = null;
export function refusal(): Refusal | null {
  return lastRefusal;
}

/**
 * How long a request may go without an answer before the screen gives the
 * button back. Apple's sheet, with its passcode step, is answered well within
 * it; a request that hangs would otherwise leave "Asking…" up for good.
 */
const ASK_WAIT_MS = 30_000;
/** A request still out, so a second tap waits for the same one instead of asking iOS twice. */
let asking: Promise<Permission> | null = null;

/**
 * Shows Apple's "allow Screen Time access" sheet. Answers "unknown" when iOS
 * hasn't answered within the wait (the request goes on; its answer still
 * counts when it comes). Anything but "approved" leaves the reason in `refusal()`.
 */
export async function askPermission(): Promise<Permission> {
  // Preview only: "?mock=refuse-passcode" (or any Refusal) stands in for iOS turning the request down.
  const mocked = [...MOCK].find((word) => word.startsWith('refuse-'));
  if (mocked) {
    lastRefusal = mocked.slice('refuse-'.length) as Refusal;
    return 'denied';
  }
  if (MOCK_PHONE) return permission();
  if (!SCREEN_TIME_AVAILABLE) return 'unknown';
  lastRefusal = null;
  asking ??= requestAccess().finally(() => {
    asking = null;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ASK_WAIT_MS);
  });
  try {
    const answer = await Promise.race([asking, late]);
    if (answer !== null) return answer;
    lastRefusal = 'noAnswer';
    note('access', 'no answer from iOS');
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

async function requestAccess(): Promise<Permission> {
  try {
    // Shows nothing when access is already on; otherwise Apple's sheet.
    await DeviceActivity.requestAuthorization('individual');
    sheetAnswer = 'approved';
    lastRefusal = null;
  } catch (error) {
    // Declined, or iOS can't grant it on this device (no passcode, say): access.ts says which.
    sheetAnswer = 'denied';
    lastRefusal = refusalOf(error);
    note('access', error);
  }
  return sheetAnswer;
}

/** Whether the day's monitoring is registered with the phone. */
export function isOn(): boolean {
  if (MOCK_PHONE) return !MOCK.has('accessOff') && !MOCK.has('notRegistered');
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return false;
  try {
    return DeviceActivity.getActivities().includes(ACTIVITY);
  } catch {
    return false;
  }
}

/** How many apps, categories and sites are in one of the person's picks. The app never learns which. */
export function pickCount(id: string): number {
  if (MOCK_PHONE) return id === ASK_ID && MOCK.has('noAskPicks') ? 0 : 3;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  try {
    const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionId: id });
    return meta ? meta.applicationCount + meta.categoryCount + sitesIn(meta) : 0;
  } catch {
    return 0;
  }
}

/**
 * The essentials (1.1), and counting everything (tally.ts). The person ticks
 * only their essentials, in Apple's list, once. The phone locks everything
 * else by category ("all, except these"), and counts everything with a timer
 * that names no apps, less the essentials' own timer. One list is kept:
 * - ESSENTIALS_ID: the apps that never count and never lock (50 at most:
 *   the most iOS will leave out of an "everything" lock).
 * With no essentials chosen, everything counts and everything locks.
 *
 * Up to 1.1's first builds Apple could only be told "count these apps", so
 * setup opened Apple's list twice: once with everything ticked (kept as
 * 'plall'), once for the essentials, and what counted was worked out as the
 * one less the other ('counted'). Those two lists are left on the phone as
 * they were and no longer read.
 */
export const ESSENTIALS_ID = 'plkeep';
/** The most apps iOS will leave out of an "everything" lock. */
export const ESSENTIALS_LIMIT = 50;
/**
 * A change to the essentials can wait for the next recharge (essentials.ts),
 * so Apple's picker never works on the list in force. It is handed a copy of
 * the list as chosen (ESSENTIALS_PICK_ID), and when it closes the rule
 * decides what starts now and what waits:
 * - ESSENTIALS_NEXT_ID: the essentials as chosen, when they hold a new one;
 * - ESSENTIALS_START_ID: the essentials this battery started with, which
 *   today's can go back up to.
 * A picker closed by the app being shut changes nothing.
 */
export const ESSENTIALS_PICK_ID = 'plkeeppick';
export const ESSENTIALS_NEXT_ID = 'plkeepnext';
export const ESSENTIALS_START_ID = 'plkeepstart';
/** The lists of the versions that counted apps by name (see above), for the readout only. */
const OLD_ALL_ID = 'plall';

/**
 * Which way of counting the day is registered with: 2 is everything, less
 * the essentials. A day registered by an earlier version (no mark) counts a
 * list of apps; `moveToEverything` moves it over on the first start.
 */
const ENGINE = 2;

function metaOf(id: string): DeviceActivity.ActivitySelectionMetadata | null {
  try {
    return DeviceActivity.activitySelectionMetadata({ activitySelectionId: id }) ?? null;
  } catch {
    return null;
  }
}

function tokenOf(id: string): string {
  try {
    const token = DeviceActivity.getFamilyActivitySelectionId(id);
    return typeof token === 'string' ? token : '';
  } catch {
    return '';
  }
}

/** Writes several of the phone's lists in one go ('' takes a list away), so they never disagree. */
function putLists(changes: Record<string, string>) {
  const all = { ...(DeviceActivity.userDefaultsGet<Record<string, string>>('familyActivitySelectionIds') ?? {}) };
  for (const [id, token] of Object.entries(changes)) {
    if (token === '') delete all[id];
    else all[id] = token;
  }
  DeviceActivity.userDefaultsSet('familyActivitySelectionIds', all);
}

/** How many apps (and sites) a list holds, counted as the essentials are. '' is no list. */
function appsIn(token: string): number {
  if (token === '') return 0;
  const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionToken: token });
  return meta ? meta.applicationCount + sitesIn(meta) : 0;
}

/** One of the phone's own ways of putting two lists together, as a list ('' when no app is left). Throws if the phone gives none. */
function combine(how: 'intersection' | 'union' | 'difference', a: string, b: string): string {
  const out = DeviceActivity[how]({ activitySelectionToken: a }, { activitySelectionToken: b }, {});
  const token = out?.familyActivitySelection;
  if (!out || typeof token !== 'string' || token === '') throw new Error('the phone gave no list');
  return out.applicationCount + sitesIn(out) === 0 ? '' : token;
}

/** The rule's questions (essentials.ts), answered by the phone on Apple's sealed picks. */
const phoneLists: Lists<string> = {
  both: (a, b) => (a === '' || b === '' ? '' : combine('intersection', a, b)),
  either: (a, b) => (a === '' ? b : b === '' ? a : combine('union', a, b)),
  less: (a, b) => (a === '' || b === '' ? a : combine('difference', a, b)),
  size: appsIn,
};

/**
 * The rule's answer, or `plain` (the change starts at once, as before the
 * rule) if the phone could not compare the lists. Said in the readout.
 */
function ruled<T>(rule: () => T, plain: T): T {
  try {
    return rule();
  } catch (error) {
    note('the waiting rule', `the lists could not be compared, so the change started at once (${error instanceof Error ? error.message : String(error)})`);
    return plain;
  }
}

/** How many essentials are ticked. */
export function essentialsCount(): number {
  if (MOCK_PHONE) return MOCK.has('noEssentials') ? 0 : 14;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  const meta = metaOf(ESSENTIALS_ID);
  return meta ? meta.applicationCount + sitesIn(meta) : 0;
}

/**
 * The essentials as Apple's picker handed them over (null: none chosen), for
 * the icon grid on the Essentials screen. iOS draws the icons from it; the
 * app never learns which apps they are.
 */
export function essentialsPicks(): string | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  return tokenOf(ESSENTIALS_ID) || null;
}

/**
 * Whether the essentials have been chosen: Apple's list closed with at least
 * one ticked, at some time. Until then everything counts and everything
 * locks, and Today offers to choose them.
 */
export function essentialsChosen(): boolean {
  if (MOCK_PHONE) return !MOCK.has('noEssentials');
  if (!SCREEN_TIME_AVAILABLE) return false;
  return readNumber('essentialsSet') > 0;
}

/**
 * The same picks with no whole categories and no websites: only the apps one
 * by one. Null if the phone's format isn't as expected. (A category would
 * take in apps installed into it later, which the lock does not keep open;
 * a website's time would be taken off whichever browser showed it.)
 */
function appsOnly(token: string): string | null {
  try {
    const picks = JSON.parse(atob(token)) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(picks)) out[key] = /categor|webdomain/i.test(key) && Array.isArray(value) ? [] : value;
    return btoa(JSON.stringify(out));
  } catch {
    return null;
  }
}

/**
 * What the essentials' own timer counts (tally.ts): the essential apps, one
 * by one. Null when there are none, and then that timer is not registered.
 * If whole categories and websites can't be left out, the list is used with
 * them.
 */
function keptToken(): string | null {
  if (essentialsCount() === 0) return null;
  const token = tokenOf(ESSENTIALS_ID);
  if (token === '') return null;
  try {
    const meta = metaOf(ESSENTIALS_ID);
    if (!meta || meta.applicationCount === 0) return token;
    const apps = appsOnly(token);
    const check = apps ? DeviceActivity.activitySelectionMetadata({ activitySelectionToken: apps }) : null;
    return apps && check && check.categoryCount === 0 && sitesIn(check) === 0 && check.applicationCount === meta.applicationCount ? apps : token;
  } catch {
    return token;
  }
}

/** Whether some apps are essentials, so the day is counted as everything less their minutes. */
function hasEssentials(): boolean {
  return essentialsCount() > 0;
}

/** What decides what counts, as one word for comparing before and after a change: the essentials, or "none". */
function countedNow(): string {
  return tokenOf(ESSENTIALS_ID) || 'none';
}

/** Tells the phone which apps stay open whatever is locked: the essentials. */
function keepEssentialsOpen() {
  try {
    DeviceActivity.clearWhitelist();
    if (essentialsCount() === 0) {
      DeviceActivity.clearWhitelistAndUpdateBlock('plainlimit');
      return;
    }
    try {
      DeviceActivity.addSelectionToWhitelistAndUpdateBlock({ activitySelectionId: ESSENTIALS_ID }, 'plainlimit');
    } catch {
      // The library objects, after doing the work, to a list kept without "every app of a category"; ours is kept with it.
    }
  } catch (error) {
    note('the essentials', error);
  }
}

/** The essentials this battery started with: today's list, if none was ever noted (a build before the rule). */
function essentialsStart(): string {
  return readNumber('essentialsStartSet') > 0 ? tokenOf(ESSENTIALS_START_ID) : tokenOf(ESSENTIALS_ID);
}

/** Call as Apple's picker opens on the essentials: it is handed a copy of the list as chosen. */
export function essentialsBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    putLists({ [ESSENTIALS_PICK_ID]: tokenOf(ESSENTIALS_NEXT_ID) || tokenOf(ESSENTIALS_ID) });
  } catch (error) {
    note('the essentials', error);
  }
}

/**
 * Call as that picker closes. More essentials than iOS can keep open are not
 * kept: nothing changes, and the number ticked is returned so the screen can
 * say so (0 when the choice was kept). Otherwise the rule decides
 * (essentials.ts): apps taken out, and apps this battery started with, are
 * today's at once; a new essential waits for the next recharge, unless the
 * day is `free` or the essentials are being chosen for the first time.
 *
 * Closed with nothing ticked before any were ever chosen, nothing changes
 * either: the essentials stay "not chosen", and Today goes on offering them.
 * (Up to build 168 that counted as a choice of none. The owner opened the
 * list from Today's card, swiped it away, and the card was gone for good,
 * with the essentials only to be found in Settings.)
 */
export function essentialsAfter(free: boolean): number {
  if (!SCREEN_TIME_AVAILABLE) return 0;
  // What counts is as it was until here: Apple's picker only had a copy.
  picksBefore();
  try {
    const picked = tokenOf(ESSENTIALS_PICK_ID);
    const meta = picked === '' ? null : (DeviceActivity.activitySelectionMetadata({ activitySelectionToken: picked }) ?? null);
    const ticked = meta?.applicationCount ?? 0;
    if (ticked > ESSENTIALS_LIMIT) {
      putLists({ [ESSENTIALS_PICK_ID]: '' });
      return ticked;
    }
    const first = readNumber('essentialsSet') === 0;
    // Apps, sites or whole categories: anything ticked at all.
    const any = meta !== null && ticked + (meta.categoryCount ?? 0) + sitesIn(meta) > 0;
    if (first && !any) {
      putLists({ [ESSENTIALS_PICK_ID]: '' });
      return 0;
    }
    const plain: EssentialsChange<string> = { today: picked, start: picked, next: null };
    const change = first ? plain : ruled(() => withEssentials(picked, essentialsStart(), free, phoneLists), plain);
    putLists({ [ESSENTIALS_PICK_ID]: '', [ESSENTIALS_ID]: change.today, [ESSENTIALS_START_ID]: change.start, [ESSENTIALS_NEXT_ID]: change.next ?? '' });
    save('essentialsStartSet', Date.now());
    save('essentialsSet', Date.now());
    keepEssentialsOpen();
    return 0;
  } catch (error) {
    note('the essentials', error);
    return 0;
  }
}

/**
 * Starts the essentials that wait for a recharge, and notes the essentials
 * then in force as the ones this battery started with. Called by the store on
 * its first look at a new battery (`newDay`), and when an emergency pass is
 * used: a pass skips the wait, and with nothing waiting it changes nothing.
 * True if a waiting list started: the caller then treats it as a change of
 * picks (`picksBefore` has been called). Throws if the phone refuses, so the
 * caller can try again on its next look.
 */
export function startWaitingPicks(newDay: boolean): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    const next = tokenOf(ESSENTIALS_NEXT_ID);
    const started = next !== '';
    if (!started && !newDay) return false;
    if (started) picksBefore();
    const day = essentialsAtRecharge(tokenOf(ESSENTIALS_ID), next === '' ? null : next);
    putLists({ [ESSENTIALS_ID]: day.today, [ESSENTIALS_START_ID]: day.start, [ESSENTIALS_NEXT_ID]: '' });
    save('essentialsStartSet', Date.now());
    if (started) keepEssentialsOpen();
    return started;
  } catch (error) {
    note('the waiting essentials', error);
    throw error;
  }
}

let joiningFor = '';
let joiningNow: { picks: string; count: number } | null = null;

/**
 * The apps that become essentials at the next recharge: the list waiting,
 * less today's, for iOS to draw their icons, and how many. Null when none
 * waits. (Worked out by the phone once for each pair of lists.)
 */
export function essentialsJoining(): { picks: string | null; count: number } | null {
  if (MOCK_PHONE) return MOCK.has('essentialsWaiting') && !MOCK.has('noEssentials') ? { picks: null, count: 2 } : null;
  if (!SCREEN_TIME_AVAILABLE) return null;
  try {
    const next = tokenOf(ESSENTIALS_NEXT_ID);
    if (next === '') return null;
    const today = tokenOf(ESSENTIALS_ID);
    const key = `${next}\n${today}`;
    if (key !== joiningFor) {
      const picks = phoneLists.less(next, today);
      joiningNow = picks === '' ? null : { picks, count: appsIn(picks) };
      joiningFor = key;
    }
    return joiningNow;
  } catch {
    return null;
  }
}

/** Sites in a selection. The library's type says "webDomainCount"; its native side sends "webdomainCount". */
function sitesIn(meta: DeviceActivity.ActivitySelectionMetadata): number {
  const raw = meta as unknown as Record<string, unknown>;
  const n = raw.webdomainCount ?? raw.webDomainCount;
  return typeof n === 'number' ? n : 0;
}

/**
 * A day registered by a version that counted a list of apps is moved over to
 * counting everything, on the first start of this one: a new round of
 * checkpoint names, since the reports so far were for that list, and nothing
 * kept of what was known about it. True if the day has to be registered
 * again (the caller does that); the mark is saved once it has been.
 */
export function moveToEverything(goalMinutes: number): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    if (readNumber('engine') === ENGINE || !isOn()) return false;
    startRound(new Date(), roundGoal(goalMinutes));
    forget('noted');
    forget('roundFloor');
    return true;
  } catch (error) {
    note('moving to the everything timer', error);
    return false;
  }
}

/**
 * Takes every cover off and, when `cover` is true, puts the empty screen back
 * over the counted apps as they are picked now. The phone keeps a running list
 * of what it covered, so new picks only take effect on the covers once that
 * list is cleared.
 */
export function coverAgain(cover: boolean, settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    // Taking every cover off takes the Ask first list's too; it goes back on unless it is open.
    coverAskAgain(settings.askFirst);
  } catch (error) {
    note('coverAgain', error);
  }
  if (cover) coverEmptyNow(settings, topUpsSoFar);
}

/**
 * Notes, while counting works, the most the everything timer can have
 * counted by now (see `mostByNow`): what the guard after the next
 * registration is worked out from. Nothing is noted once its last checkpoint
 * is passed.
 */
export function noteKnown(settings: Settings, now = new Date()) {
  if (!SCREEN_TIME_AVAILABLE) return;
  // Right after counting is set up the phone is still sending reports for time
  // already used, so "not reported yet" does not yet mean "not reached yet".
  // And the figure noted before the registration is the one guarding it.
  if (now.getTime() - registeredAt() < GUARD_MS) return;
  try {
    const goal = roundGoal(settings.goalMinutes);
    const counted = everythingCounted(dayInput(settings.goalMinutes, periodStartOf(now, settings.rechargeMinute)));
    const most = mostByNow(goal, counted, 20, hasEssentials() ? overRungs(goal).map((x) => x.minutes) : []);
    if (most === null) return;
    save('noted', { at: now.getTime(), most } satisfies Noted);
  } catch {
    // Without it the guard falls back to the time since the recharge.
  }
}

/** The activities whose checkpoints are the day's count: the everything timer's three, and the essentials' own. */
const COUNTING = [ACTIVITY, TICKS_ACTIVITY, KEPT_ACTIVITY, OVER_ACTIVITY];

/** Where the phone notes that a waiting action has acted today (the library patch, `plainlimitTally`), under the round's name. */
const DONE_PREFIX = 'plainlimit_done_';

/**
 * Starts a new round of checkpoint names (roundName). Done whenever reports
 * already made would mean something else: the ticked apps changed, or the goal
 * did ("cell-3" is 90 minutes of a 3-hour goal, 120 of a 4-hour one).
 */
function startRound(now: Date, goalBefore: number) {
  // Only one earlier round is still read (as the previous one, while the
  // phone re-reports): the one ending, or the one before it if the phone has
  // reported nothing for the one ending yet (roundStanding). Reports from any
  // other round are no use any more.
  const ending = round();
  let stands = ending;
  try {
    const reports = COUNTING.flatMap((activity) => DeviceActivity.getEvents(activity)).filter((e) => e.callbackName === 'eventDidReachThreshold' && !!e.eventName);
    stands = roundStanding(new Set(reports.map((e) => splitName(e.eventName as string).round)), ending, readString('roundBefore'));
    for (const e of reports) {
      if (splitName(e.eventName as string).round !== stands) DeviceActivity.userDefaultsRemove(`events_${e.activityName}_eventDidReachThreshold_${e.eventName}`);
    }
  } catch {
    // Tidying only.
  }
  try {
    // What the ending round's actions noted as done says nothing about the new one's.
    DeviceActivity.userDefaultsClearWithPrefix(DONE_PREFIX);
  } catch {
    // Tidying only: they carry the old round's name.
  }
  save('roundBefore', stands);
  // The goal the standing round was registered with: unchanged when it is the older one.
  if (stands === ending) save('roundGoalBefore', goalBefore);
  save('round', now.getTime().toString(36));
  save('picksChangedAt', now.getTime());
}

/** Call before the lists that decide what counts are changed (`picksAfter` then says whether they did). */
export function picksBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    save('picksBefore', countedNow());
  } catch {
    // Without it, closing the picker changes nothing about today's count.
  }
}

/** Call once they are changed, before the day is registered again. True if what counts changed. */
export function picksAfter(goalMinutes: number, now = new Date()): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    const before = readString('picksBefore');
    forget('picksBefore');
    if (before === '' || before === countedNow()) return false;
    // A new round of names, so reports for the old list can't pass for the new one.
    startRound(now, roundGoal(goalMinutes));
    // The last known figure was for the old list; it is dropped, and a new
    // one is noted once counting has settled again.
    forget('noted');
    return true;
  } catch {
    return false;
  }
}

/**
 * A short record of finished days disappearing from the history, for the
 * readout. Build 57 lost Friday between 11:57 AM and 5:57 PM with no code path
 * found that removes a day; this says when it happens and what did it.
 */
export function noteHistoryLoss(line: string): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    save('historyLog', [...readLines('historyLog'), `${timeOf(Date.now())}: ${line}`].slice(-6));
  } catch {
    // Only a record; never in the way.
  }
}

export function historyLog(): string[] {
  if (!SCREEN_TIME_AVAILABLE) return [];
  return readLines('historyLog');
}

/** The start of today's count, for keeping reports to today's. */
function dayStartOf(periodStart: Date): Date {
  return countStart(periodStart, countingSince());
}

const UNCOVER: Action[] = [{ type: 'disableBlockAllMode' }, { type: 'resetBlocks' }];
const STOP_EARNED_TIME: Action = { type: 'stopMonitoring', activityNames: [TOPUP_ACTIVITY] };

/** The last thing the phone refused, for the test build's readout. */
function note(where: string, error: unknown) {
  const at = new Date().toLocaleTimeString();
  try {
    save('problem', `${where}, ${at}: ${error instanceof Error ? error.message : String(error)}`);
  } catch {
    // Nothing more to do; this is only for the readout.
  }
}

/** Everything is covered except the essentials (the phone holds the list of what stays open, see `keepEssentialsOpen`). */
function coverAction(shield: string): Action {
  return { type: 'enableBlockAllMode', shieldId: shield };
}

function toAction(action: PlanAction): Action {
  if (action.kind === 'cover') return coverAction(action.shield);
  return { type: 'sendNotification', payload: { title: action.title, body: action.body, sound: 'default', userInfo: action.route ? { route: action.route } : {} } };
}

function buttonAction(effect: ButtonEffect, topUpsSoFar: number): ShieldAction {
  if (effect === 'uncover') return { behavior: 'defer', actions: UNCOVER };
  if (effect === 'puzzle') {
    const notice = puzzleNotice(topUpsSoFar);
    return {
      behavior: 'close',
      actions: [{ type: 'sendNotification', payload: { title: notice.title, body: notice.body, sound: 'default', interruptionLevel: 'active', userInfo: { route: notice.route } } }],
    };
  }
  return { behavior: 'close', actions: [] };
}

function shieldParts(shield: PlanShield, topUpsSoFar: number): { look: ShieldConfiguration; buttons: ShieldActions } {
  const look: ShieldConfiguration = {
    title: shield.copy.title,
    subtitle: shield.copy.line,
    primaryButtonLabel: shield.copy.primary,
    backgroundColor: shield.background,
    // A dark material in light mode too, so the light words always have a dark ground.
    backgroundBlurStyle: DeviceActivity.UIBlurEffectStyle.systemMaterialDark,
    titleColor: shield.text,
    subtitleColor: shield.text,
    iconSystemName: shield.icon,
    iconTint: shield.accent,
    primaryButtonBackgroundColor: shield.button,
    primaryButtonLabelColor: shield.buttonText,
    secondaryButtonLabelColor: shield.text,
  };
  if (shield.copy.secondary && shield.secondary) look.secondaryButtonLabel = shield.copy.secondary;
  const buttons: ShieldActions = { primary: buttonAction(shield.primary, topUpsSoFar) };
  if (shield.copy.secondary && shield.secondary) buttons.secondary = buttonAction(shield.secondary, topUpsSoFar);
  return { look, buttons };
}

function writeShield(shield: PlanShield, topUpsSoFar: number) {
  const { look, buttons } = shieldParts(shield, topUpsSoFar);
  DeviceActivity.updateShieldWithId(look, buttons, shield.id);
}

/**
 * Tells the phone what to do at each checkpoint, and not to do it before the
 * checkpoint can be true (see `lockNotBefore`), nor while setup
 * holds the locks. This only writes settings; it registers nothing, so it is
 * safe to repeat.
 *
 * With essentials, each action also waits on the essentials' own timer
 * (`Tally`, tally.ts), and the everything timer's rungs past the goal carry
 * the same actions. What the monitor extension needs to work that out is
 * left once, in `tally`, instead of with every action.
 */
function writeCheckpointActions(plan: Plan, settings: Settings, now: Date) {
  const dayStart = dayStartOf(periodStartOf(now, settings.rechargeMinute));
  const guard = savedGuard();
  // Nothing acts while setup holds the locks, nor while earned time or an emergency pass runs (`grantExtraTime`).
  const held = Math.max(holdUntil(), earnedUntil());
  const named = round();
  const registered = registeredAt();
  // Every checkpoint of the everything timer, under the key the monitor extension keeps its time in.
  const all = [
    ...plan.events.map((e) => ({ name: eventKey(plan.activity, roundName(e.name, named)), minutes: e.minutes })),
    ...plan.ticks.map((t) => ({ name: eventKey(TICKS_ACTIVITY, roundName(t.name, named)), minutes: t.minutes })),
    ...plan.over.map((x) => ({ name: eventKey(OVER_ACTIVITY, roundName(x.name, named)), minutes: x.minutes })),
  ];
  for (const event of plan.events) {
    const notBefore = new Date(Math.max(lockNotBefore(dayStart, guard, event.minutes).getTime(), held));
    const actions: PacedAction[] = event.actions.map((a) => ({ ...toAction(a), neverTriggerBefore: notBefore, ...(a.tally ? { tally: a.tally } : {}) }));
    if (actions.length > 0) {
      // Not faster than the clock (keepsPace): checked by the monitor extension
      // against the times of the reports before this one (patches/react-native-device-activity).
      const pace: PaceSpec = { skipFrom: reReportsFrom(), skipTo: registered > 0 ? registered + GUARD_MS : 0, after: paceRules(event.minutes, all).map((r) => ({ key: r.name, ms: r.ms })) };
      for (const action of actions) action.pace = pace;
      // ...and when it is too soon, the one notification that brings the person back to count again.
      actions.push({
        type: 'sendNotification',
        payload: { identifier: TOO_SOON_NOTICE.id, title: TOO_SOON_NOTICE.title, body: TOO_SOON_NOTICE.body, sound: 'default', userInfo: {} },
        neverTriggerBefore: notBefore,
        pace: { ...pace, mode: 'onlyIfTooSoon' },
      } as PacedAction);
    }
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'eventDidReachThreshold', eventName: roundName(event.name, named), actions: actions as Action[] });
  }
  // The rungs past the goal. Their pace is checked from the one list in `tally` (`minutes` asks for it): a list with
  // each of their actions would be most of a megabyte in the settings the monitor extension has to load.
  for (const event of plan.over) {
    const notBefore = new Date(Math.max(lockNotBefore(dayStart, guard, event.minutes).getTime(), held));
    const actions: PacedAction[] = event.actions.map((a) => ({ ...toAction(a), neverTriggerBefore: notBefore, ...(a.tally ? { tally: { ...a.tally, minutes: event.minutes } } : {}) }));
    DeviceActivity.configureActions({ activityName: OVER_ACTIVITY, callbackName: 'eventDidReachThreshold', eventName: roundName(event.name, named), actions: actions as Action[] });
  }
  if (plan.kept.length === 0) {
    forget('tally');
    return;
  }
  save('tally', {
    round: named,
    rechargeMinute: settings.rechargeMinute,
    countFrom: countingSince() ?? 0,
    registeredAt: registered,
    reReportsFrom: reReportsFrom(),
    kept: plan.kept.map((k) => ({ key: eventKey(KEPT_ACTIVITY, roundName(k.name, named)), minutes: k.minutes })),
    everything: all.map((c) => ({ key: c.name, minutes: c.minutes })),
  } satisfies TallyRecord);
}

/** The day's plan as this file hands it on. */
type Plan = ReturnType<typeof monitorPlan>;

/** The day's plan with the settings as they are, counted from when today's count began, with or without essentials as the phone has them now. */
function planFor(settings: Settings, topUpsSoFar: number): Plan {
  return monitorPlan(settings, topUpsSoFar, countingSince(), hasEssentials());
}

/**
 * What the monitor extension reads to weigh an action against the essentials'
 * timer (the library patch, `plainlimitTally`; tally.ts has the rule): the
 * round, when the day's count begins, when the day was last registered (it
 * acts on nothing in the settling after that), when today's re-reporting
 * began (reports since then pace nothing), and where each timer's reports
 * are kept, with their minutes.
 */
interface TallyRecord {
  round: string;
  rechargeMinute: number;
  countFrom: number;
  registeredAt: number;
  reReportsFrom: number;
  kept: { key: string; minutes: number }[];
  everything: { key: string; minutes: number }[];
}

/** Every checkpoint of a plan with its minutes, for the widget's pacing (targets/widget, keepsPace). */
function marksFor(plan: Plan): { activity: string; name: string; minutes: number; kept?: true }[] {
  return [
    ...plan.events.map((e) => ({ activity: plan.activity, name: e.name, minutes: e.minutes })),
    ...plan.ticks.map((t) => ({ activity: TICKS_ACTIVITY, name: t.name, minutes: t.minutes })),
    ...plan.over.map((x) => ({ activity: OVER_ACTIVITY, name: x.name, minutes: x.minutes })),
    // The essentials' own timer: the widget takes its minutes off, as the app does (tally.ts).
    ...plan.kept.map((k) => ({ activity: KEPT_ACTIVITY, name: k.name, minutes: k.minutes, kept: true as const })),
  ];
}

/**
 * Gives a widget plan saved before pacing existed what it needs for it, so the
 * widget paces from the first launch of a build that has it, not from the next
 * registration. Only when the saved plan is for the same goal.
 */
function sharePaceWithWidget(plan: Plan) {
  const saved = DeviceActivity.userDefaultsGet<Record<string, unknown>>(SAVED.widgetPlan);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved.marks) || saved.goalMinutes !== plan.widget.goalMinutes) return;
  save('widgetPlan', { ...saved, registeredAt: registeredAt(), reReportsFrom: reReportsFrom(), marks: marksFor(plan) });
}

/** Where the monitor extension keeps the time of a checkpoint's latest report (the library's `userDefaultKeyForEvent`). */
function eventKey(activity: string, name: string): string {
  return `events_${activity}_eventDidReachThreshold_${name}`;
}

/**
 * The pace rule for one checkpoint's actions, read by the library patch: act
 * only if, for each listed earlier report, at least `ms` have passed since it,
 * leaving out reports made between `skipFrom` and `skipTo` (from today's
 * first registration to ten minutes after its last: the phone re-reports the
 * day with fresh times after each, and a report left from one is still
 * standing at the next; checkpoints.ts, `reReportsStart`). With
 * `mode` 'onlyIfTooSoon' the action runs only when the rule is broken.
 */
interface PaceSpec {
  skipFrom: number;
  skipTo: number;
  after: { key: string; ms: number }[];
  mode?: 'onlyIfTooSoon';
}

type PacedAction = Action & { pace?: PaceSpec; tally?: Tally & { minutes?: number } };

/**
 * Writes the covering screens' look and words, and what happens at each
 * checkpoint, again, and nothing else. Called when the app starts or comes to
 * the front, so that an update reaches the phone without the day having to be
 * registered again (which on a first day would restart the count).
 */
export function refreshScreens(settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE || !isOn()) return;
  try {
    const plan = planFor(settings, topUpsSoFar);
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);
    // Today's "not before" times, so the guard against early checkpoints holds on each day the app is opened.
    writeCheckpointActions(plan, settings, new Date());
    sharePaceWithWidget(plan);
  } catch (error) {
    note('the screens', error);
  }
}

/**
 * Registers the day with the phone: the checkpoints, the screens, the buttons,
 * and what the widget needs. Safe to call again whenever a setting changes;
 * the phone keeps today's count.
 */
/**
 * Plainlimit's own registering (setup, a new goal, new picks) can stop and
 * restart the phone's monitoring, and the phone's list of activities can lag a
 * little behind; a health check during it, or just after, says nothing about
 * the day.
 */
let registering = 0;
let registerFinishedAt = 0;
const REGISTER_SETTLE_MS = 10_000;

export function busyRegistering(nowMs = Date.now()): boolean {
  return registering > 0 || nowMs - registerFinishedAt < REGISTER_SETTLE_MS;
}

/**
 * When counting was first seen not working, in the current run of checks with
 * no "fine" between them. Kept across launches, so a fault that lasts while
 * Plainlimit is closed is still caught on the next look.
 */
export function wrongSince(nowMs: number): number {
  if (!SCREEN_TIME_AVAILABLE) return nowMs;
  const at = readNumber('wrongSince');
  if (at > 0 && at <= nowMs) return at;
  try {
    save('wrongSince', nowMs);
  } catch {
    // Only a record.
  }
  return nowMs;
}

/** Counting looked fine again: the run of bad checks is over. */
export function rightAgain(): void {
  if (!SCREEN_TIME_AVAILABLE || readNumber('wrongSince') === 0) return;
  try {
    forget('wrongSince');
  } catch {
    // Only a record.
  }
}

/**
 * The goal the day is registered with now, or 0 if it never was. It can
 * differ from today's goal for a moment after a change, and after a recharge
 * that starts a higher goal (goal.ts) until the app registers the day again:
 * the phone's checkpoints are still the old goal's until then.
 */
export function registeredGoal(): number {
  if (!SCREEN_TIME_AVAILABLE) return 0;
  return readNumber('registeredGoal');
}

/**
 * The recharge time the day is registered with now, or null if unknown (never
 * registered, or registered before this was kept). It differs from today's
 * after a recharge that starts a new time (recharge.ts) until the app
 * registers the day again.
 */
export function registeredRecharge(): number | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  return readNumberOrNull('registeredRecharge');
}

/**
 * The goal the current round's checkpoints were registered with, which is
 * what their names mean ("cell-3" is 90 minutes of a 3-hour goal, 120 of a
 * 4-hour one). Today's goal only when the day was never registered.
 */
function roundGoal(todayGoal: number): number {
  const registered = registeredGoal();
  return registered > 0 ? registered : todayGoal;
}

export async function applyPlan(settings: Settings, topUpsSoFar: number, fresh = false, hold = false): Promise<boolean> {
  registering += 1;
  try {
    const ok = await registerPlan(settings, topUpsSoFar, fresh, hold);
    if (ok && hasEssentials()) coverOnceSettled(settings, topUpsSoFar);
    return ok;
  } finally {
    registering -= 1;
    registerFinishedAt = Date.now();
  }
}

/**
 * With essentials, the phone locks nothing on the reports it makes in the
 * settling after a registration: they come for both timers at once, in no
 * order, so a rung past the goal can arrive before the essentials' minutes
 * that explain it (tally.ts, SETTLE_MS). Once it is over the app reads the
 * day as it stands and, if the battery is empty, puts the covers up itself,
 * and has the widget drawn again.
 * If the app has been left by then, the next rung past the goal locks
 * instead: at most a few minutes of use later.
 */
let settling: ReturnType<typeof setTimeout> | null = null;
function coverOnceSettled(settings: Settings, topUpsSoFar: number) {
  if (settling) clearTimeout(settling);
  settling = setTimeout(() => {
    settling = null;
    try {
      const now = new Date();
      if (!isOn() || Math.max(holdUntil(), earnedUntil()) > now.getTime()) return;
      const used = usedSoFar(settings.goalMinutes, periodStartOf(now, settings.rechargeMinute));
      if (used !== null && used >= roundGoal(settings.goalMinutes)) coverEmptyNow(settings, topUpsSoFar);
    } catch (error) {
      note('covering after the day was registered', error);
    }
    // The widget was not redrawn for the essentials' reports nor the rungs past the goal while they settled (the library patch, plainlimitRedraws).
    reloadWidget();
  }, SETTLE_MS + 2000);
}

async function registerPlan(settings: Settings, topUpsSoFar: number, fresh: boolean, hold: boolean): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return false;
  try {
    const now = new Date();
    // Held for two hours at most, in case setup is left half done.
    if (hold) save('holdUntil', now.getTime() + 2 * 3600 * 1000);
    else if (fresh) forget('holdUntil');
    // The picks changed since the day was last registered (a recharge can start a waiting goal and waiting essentials together).
    const picksMoved = picksChangedAt() > registeredAt();
    // With essentials, the day's figure is only sure once the reports of the last registration are all in:
    // the everything timer's can come before the essentials' own, and for that moment the essentials'
    // minutes look used (tally.ts, SETTLE_MS). A floor taken then would keep them counted all day.
    const sure = figureSure(hasEssentials(), now.getTime(), registeredAt(), PICKS_QUIET_MS);
    // Reports left from an earlier registration today prove no more than this one's will (checkpoints.ts, reReportsStart).
    save('reReportsFrom', reReportsStart(now.getTime(), dayStartOf(periodStartOf(now, settings.rechargeMinute)).getTime(), readNumber('reReportsFrom'), registeredAt(), fresh));
    save('registeredAt', now.getTime());
    // A different goal gives the same checkpoint names other minutes, and a
    // different recharge time counts them from another moment.
    const lastGoal = readNumber('registeredGoal');
    const lastRecharge = readNumberOrNull('registeredRecharge');
    const goalMoved = lastGoal > 0 && lastGoal !== settings.goalMinutes;
    const rechargeMoved = lastRecharge !== null && lastRecharge !== settings.rechargeMinute;
    if (!fresh && (goalMoved || rechargeMoved)) {
      // Only the goal moved: today's use stays what it is now while the phone re-reports the day for the new goal (Floor).
      // Not when the picks moved too: a new essential honestly takes off what it used.
      const day = dayStartOf(periodStartOf(now, settings.rechargeMinute)).getTime();
      const floor = goalMoved && !rechargeMoved && !picksMoved && sure ? usedSoFar(lastGoal, periodStartOf(now, settings.rechargeMinute)) : null;
      startRound(now, lastGoal > 0 ? lastGoal : settings.goalMinutes);
      if (floor !== null && floor > 0) save('roundFloor', { round: round(), dayStart: day, minutes: floor });
      else forget('roundFloor');
    } else if (!fresh && !picksMoved && isOn() && hasEssentials() && sure) {
      // Nothing moved, and the phone is about to re-report the day with fresh times. With essentials the figure
      // rests on which report came before which (tally.ts), so re-reported all at once it can come out a rung or
      // two lower. The day's use is no less than it is known to be now (Floor).
      const day = dayStartOf(periodStartOf(now, settings.rechargeMinute)).getTime();
      const known = usedSoFar(settings.goalMinutes, periodStartOf(now, settings.rechargeMinute));
      if (known !== null && known > 0) save('roundFloor', { round: round(), dayStart: day, minutes: known });
    }
    save('registeredGoal', settings.goalMinutes);
    save('registeredRecharge', settings.rechargeMinute);
    if (fresh) {
      // Counting starts (or starts over) now: forget earlier checkpoints and take every cover away.
      stopEarnedTimer();
      forget('earnedUntil');
      forget('roundFloor');
      DeviceActivity.stopMonitoring(COUNTING);
      for (const activity of COUNTING) DeviceActivity.userDefaultsClearWithPrefix(`events_${activity}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TOPUP_ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(DONE_PREFIX);
      DeviceActivity.disableBlockAllMode('plainlimit');
      DeviceActivity.resetBlocks('plainlimit');
      // Taking every cover off takes the Ask first list's too; it goes back on unless it is open.
      coverAskAgain(settings.askFirst);
      save('countingSince', now.getTime());
    }
    const since = countingSince();
    // The guard for this registration, from the figure noted before it (see `Guard`).
    const guard = guardFor(noted(), now.getTime(), countStart(periodStartOf(now, settings.rechargeMinute), since));
    if (guard) save('guard', guard);
    else forget('guard');
    // With essentials, the day is everything less their minutes, on a timer of their own (tally.ts).
    const kept = keptToken();
    const plan = monitorPlan(settings, topUpsSoFar, since, kept !== null);
    const earlier = includesEarlierUse(periodStartOf(now, settings.rechargeMinute), since);
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);

    // The essentials stay open whatever is locked.
    keepEssentialsOpen();

    // The rungs past the goal are written for this round alone: an earlier round's are no use, and there are many.
    DeviceActivity.userDefaultsClearWithPrefix(`actions_for_${OVER_ACTIVITY}_`);
    writeCheckpointActions(plan, settings, now);
    // The screens come off when the day ends, a minute before the next one starts.
    // ...and the Ask first list's cover goes back on (askFirst.ts).
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'intervalDidEnd', actions: [...UNCOVER, STOP_EARNED_TIME, ...askCoverActions(settings.askFirst)] });

    const named = round();
    // The widget paces reports as the app does (keepsPace): it needs every checkpoint's minutes, when this registration was and when today's first was.
    save('widgetPlan', { ...plan.widget, round: named, roundBefore: readString('roundBefore'), picksChangedAt: picksChangedAt(), registeredAt: now.getTime(), reReportsFrom: reReportsFrom(), marks: marksFor(plan) });

    // The essentials' timer first, so its reports of the day so far are not behind the everything timer's.
    await registerKept(plan, kept, earlier, named);
    // No apps named: the phone counts everything (monitorPlan.ts, EVERYTHING).
    await DeviceActivity.startMonitoring(
      plan.activity,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.events.map((event) => ({ eventName: roundName(event.name, named), familyActivitySelection: EVERYTHING, threshold: event.after, includesPastActivity: earlier })),
    );
    save('engine', ENGINE);
    await registerTicks(plan, earlier, named);
    await registerOver(plan, earlier, named);
    reloadWidget();
    return true;
  } catch (error) {
    note('the day', error);
    return false;
  }
}

/**
 * The minute checkpoints, on their own registration over the same stretch of
 * day. A failure here is noted and otherwise ignored: the day still counts
 * and locks, only in cell-sized steps.
 */
async function registerTicks(plan: Plan, earlier: boolean, named: string) {
  try {
    if (plan.ticks.length === 0) {
      DeviceActivity.stopMonitoring([TICKS_ACTIVITY]);
      return;
    }
    await DeviceActivity.startMonitoring(
      TICKS_ACTIVITY,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.ticks.map((tick) => ({ eventName: roundName(tick.name, named), familyActivitySelection: EVERYTHING, threshold: tick.after, includesPastActivity: earlier })),
    );
  } catch (error) {
    note('the minute checkpoints', error);
  }
}

/**
 * The essentials' own timer (tally.ts), over the same stretch of day. With no
 * essentials it is stopped. A failure is noted and shows as "not registered"
 * in the health check: without it the essentials' minutes would use the battery.
 */
async function registerKept(plan: Plan, kept: string | null, earlier: boolean, named: string) {
  try {
    if (kept === null || plan.kept.length === 0) {
      DeviceActivity.stopMonitoring([KEPT_ACTIVITY]);
      return;
    }
    await DeviceActivity.startMonitoring(
      KEPT_ACTIVITY,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.kept.map((rung) => ({ eventName: roundName(rung.name, named), familyActivitySelection: kept, threshold: rung.after, includesPastActivity: earlier })),
    );
  } catch (error) {
    note('the essentials\u2019 timer', error);
  }
}

/** The everything timer's rungs past the goal (tally.ts), which lock once the essentials' minutes are taken off. None without essentials. */
async function registerOver(plan: Plan, earlier: boolean, named: string) {
  try {
    if (plan.over.length === 0) {
      DeviceActivity.stopMonitoring([OVER_ACTIVITY]);
      return;
    }
    await DeviceActivity.startMonitoring(
      OVER_ACTIVITY,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.over.map((rung) => ({ eventName: roundName(rung.name, named), familyActivitySelection: EVERYTHING, threshold: rung.after, includesPastActivity: earlier })),
    );
  } catch (error) {
    note('the checkpoints past the goal', error);
  }
}

/** How the day's counting stands. Only ever not 'fine' when counting is meant to be on. */
export type Health = 'fine' | 'accessOff' | 'notRegistered' | 'miscounted';

/**
 * Whether the day is really being counted. `watching` is whether the person
 * has counting turned on; turning it off on purpose is not a fault.
 * - accessOff: Screen Time access has been taken away in the Settings app.
 * - notRegistered: the phone has forgotten the day's monitoring, or, with
 *   essentials, their own timer (without it their minutes would use the battery).
 * - miscounted: the phone reported a checkpoint too soon to be true (see `miscounted`).
 * (Up to 1.1's first builds there was "nothing picked" too: with nothing
 * ticked nothing counted. Now everything counts unless it is an essential.)
 */
export function health(settings: Settings, periodStart: Date, watching: boolean): Health {
  if (MOCK_PHONE) return (['accessOff', 'notRegistered', 'miscounted'] as const).find((h) => MOCK.has(h)) ?? 'fine';
  if (!SCREEN_TIME_AVAILABLE || !watching) return 'fine';
  if (permission() !== 'approved') return 'accessOff';
  try {
    const registered = DeviceActivity.getActivities();
    if (!registered.includes(ACTIVITY)) return 'notRegistered';
    if (readNumber('engine') === ENGINE && hasEssentials() && !registered.includes(KEPT_ACTIVITY)) return 'notRegistered';
    return miscounted(phoneReports(), roundGoal(settings.goalMinutes), round(), dayStartOf(periodStart), savedGuard(), registeredAt(), reReportsFrom()) ? 'miscounted' : 'fine';
  } catch {
    return 'fine';
  }
}

/** Every checkpoint report the phone has kept for these activities. */
function phoneReports(activities: string[] = COUNTING): Report[] {
  return activities
    .flatMap((activity) => DeviceActivity.getEvents(activity))
    .filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName)
    .map((e) => ({ name: e.eventName as string, at: e.lastCalledAt.getTime() }));
}

/** The day's rounds of checkpoint names, as saved on the phone. */
function rounds(): Rounds {
  return { round: round(), roundBefore: readString('roundBefore'), goalBefore: readNumber('roundGoalBefore'), picksChangedAt: picksChangedAt(), kept: hasEssentials() };
}

/**
 * After a miscount: forgets the reports that could not be true, so the phone
 * may make them again, and registers the day afresh. What was used since the
 * recharge still counts.
 */
export async function countAgain(settings: Settings, topUpsSoFar: number, periodStart: Date): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    // Counting again is to drop a figure that can't be true: nothing held from before may keep it up.
    forget('roundFloor');
    for (const report of doubtful(phoneReports(), roundGoal(settings.goalMinutes), round(), dayStartOf(periodStart), savedGuard(), registeredAt(), reReportsFrom())) {
      DeviceActivity.userDefaultsRemove(`events_${ACTIVITY}_eventDidReachThreshold_${report.name}`);
    }
  } catch (error) {
    note('counting again', error);
  }
  return applyPlan(settings, topUpsSoFar);
}

/** Whether the app may still count again by itself for this battery (store.ts, checkHealth): once a battery. */
export function recountDue(periodStart: Date): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  return readNumber('recountedFor') !== periodStart.getTime();
}

export function markRecounted(periodStart: Date) {
  try {
    save('recountedFor', periodStart.getTime());
  } catch (error) {
    note('counting again', error);
  }
}

/** Stops counting and takes any covering screen away. */
export function turnOff() {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    stopEarnedTimer();
    forget('earnedUntil');
    DeviceActivity.stopMonitoring(COUNTING);
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    stopAskFirst();
    forget('tally');
    forget('widgetPlan');
    forget('countingSince');
    reloadWidget();
  } catch {
    // Nothing more to do.
  }
}

/** What the day's reports are read with (reports.ts): the phone's reports and what is saved about the day's registrations. */
function dayInput(goalMinutes: number, periodStart: Date, periodEnd?: Date): DayInput {
  return {
    reports: phoneReports(),
    goalMinutes: roundGoal(goalMinutes),
    dayStart: dayStartOf(periodStart).getTime(),
    periodEnd: periodEnd?.getTime(),
    rounds: rounds(),
    guard: savedGuard(),
    now: Date.now(),
    registeredAt: registeredAt(),
    reReportsFrom: reReportsFrom(),
  };
}

/**
 * The minutes known to be used since the last recharge, from the checkpoints
 * the phone has reported: everything, less the essentials (tally.ts).
 * Checkpoints that arrive impossibly early are ignored.
 */
export function usedSoFar(goalMinutes: number, periodStart: Date, periodEnd?: Date): number | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  try {
    const input = dayInput(goalMinutes, periodStart, periodEnd);
    // After a change of goal alone, never less than was known before it (Floor).
    return withFloor(countDay(input), savedFloor(), round(), input.dayStart);
  } catch {
    return null;
  }
}

function timeOf(ms: unknown): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 'never';
  const at = new Date(ms);
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

/**
 * Test builds only: what the phone, the monitor extension and the widget have
 * each recorded, as plain lines for Settings. It is how a screenshot from a
 * real phone says which link in the chain is not working.
 */
export function diagnostics(settings: Settings): string[] {
  if (!SCREEN_TIME_AVAILABLE) return [];
  try {
    const lines: string[] = [];
    // So a screenshot shows how old the lines below are.
    lines.push(`Build: ${widgets?.build?.() ?? 'unknown'}. Read at: ${timeOf(Date.now())}`);
    const guard = savedGuard();
    const notedNow = noted();
    lines.push(`Counting since: ${countingSince() ? timeOf(countingSince()) : 'the recharge'}`);
    lines.push(`Known: ${notedNow ? `at most ${Math.round(notedNow.most)} min at ${timeOf(notedNow.at)}` : 'nothing yet'}${holdUntil() > Date.now() ? ' (locks held for setup)' : ''}`);
    const floor = savedFloor();
    if (floor && floor.round === round()) lines.push(`Kept through the goal change: at least ${Math.round(floor.minutes)} min`);
    // Earned time or an emergency pass: no checkpoint covers anything before it ends (grantExtraTime).
    if (earnedUntil() > Date.now()) lines.push(`Open time until: ${timeOf(earnedUntil())} (checkpoints wait for it)`);
    const first = reReportsFrom();
    lines.push(`Registered at: ${timeOf(registeredAt())}${first > 0 && first < registeredAt() ? ` (first today ${timeOf(first)})` : ''}${guard ? `; reports until ${timeOf(guard.closes)} judged from ${timeOf(guard.from)}` : ''}`);
    lines.push(`Health: ${health(settings, periodStartOf(new Date(), settings.rechargeMinute), true)}`);
    // The two timers behind the day's figure (tally.ts): everything, and the essentials' own. Each is the highest
    // checkpoint the phone has reported, so the real figure lies between it and the next one.
    const today = dayInput(settings.goalMinutes, periodStartOf(new Date(), settings.rechargeMinute));
    const everything = everythingCounted(today);
    lines.push(`Counting: everything${hasEssentials() ? ', less your essentials' : ' (no essentials)'}`);
    lines.push(`Everything timer: at least ${everything} min`);
    if (hasEssentials()) lines.push(`Essentials timer: at least ${keptCounted(today)} min`);
    lines.push(`Used (what the battery shows): ${countDay(today)} min of ${today.goalMinutes}`);
    lines.push(`Registered: ${DeviceActivity.getActivities().join(', ') || 'nothing'}`);
    const from = dayStartOf(periodStartOf(new Date(), settings.rechargeMinute));
    const ignored = new Set(doubtful(phoneReports(), roundGoal(settings.goalMinutes), round(), from, guard, registeredAt(), reReportsFrom()).map((r) => r.name));
    // The minute checkpoints too, in the order they came: a burst of them is what a false reading looks like (keepsPace).
    const reported = DeviceActivity.getEvents()
      .filter((e) => COUNTING.includes(e.activityName) || e.activityName === TOPUP_ACTIVITY)
      .sort((a, b) => a.lastCalledAt.getTime() - b.lastCalledAt.getTime())
      .map((e) => {
        const early = e.activityName === ACTIVITY && e.eventName !== undefined && e.eventName !== null && ignored.has(e.eventName);
        return `${e.eventName ?? `${e.activityName} ${e.callbackName}`}: ${timeOf(e.lastCalledAt.getTime())}${early ? ' (too soon to be true, ignored)' : ''}`;
      });
    lines.push(reported.length ? `Reported by the phone:\n  ${reported.join('\n  ')}` : 'Reported by the phone: nothing yet');
    lines.push(`Monitor asked for a widget redraw: ${timeOf(readNumber('reloadAsked'))}`);
    const cells = DeviceActivity.userDefaultsGet<number>(SAVED.widgetCells);
    lines.push(`Widget last drew: ${timeOf(readNumber('widgetDrew'))}${typeof cells === 'number' ? ` (${cells < 0 ? 'not set up' : `${cells} cells`})` : ''}`);
    lines.push(`Round: ${round() || 'first'}${picksChangedAt() > 0 ? `, started ${timeOf(picksChangedAt())}` : ''}`);
    // The library notes who last changed what is covered, and when.
    const last = DeviceActivity.userDefaultsGet<Record<string, unknown>>('lastBlockUpdate');
    if (last && typeof last === 'object') {
      const at = typeof last.blockedAt === 'string' ? timeOf(new Date(last.blockedAt).getTime()) : 'unknown';
      const what = last.blockingAllModeEnabled ? `everything except ${Number(last.whitelistAppCount ?? 0)} apps` : `${Number(last.blocklistCategoryCount ?? 0)} categories, ${Number(last.blocklistAppCount ?? 0)} apps`;
      lines.push(`Covers last changed: ${at} by ${String(last.triggeredBy ?? 'unknown')} (now covering ${what})`);
    } else {
      lines.push('Covers last changed: never');
    }
    // What is ticked and what is covered, split by kind: whole categories and
    // single apps are locked by different means (build 86: categories locked, single apps did not).
    const kinds = (m: DeviceActivity.ActivitySelectionMetadata | undefined | null) => (m ? `${m.applicationCount} single apps, ${m.categoryCount} categories, ${sitesIn(m)} sites${m.includeEntireCategory ? ', with every app of each category' : ''}` : 'nothing');
    lines.push('Lock: everything except your essentials');
    lines.push(`Essentials: ${essentialsChosen() ? kinds(metaOf(ESSENTIALS_ID)) : 'not chosen yet'}`);
    // The waiting rule (essentials.ts): what starts at the next recharge, and what today's essentials can go back up to.
    lines.push(`Essentials waiting for the recharge: ${tokenOf(ESSENTIALS_NEXT_ID) ? kinds(metaOf(ESSENTIALS_NEXT_ID)) : 'none'}`);
    lines.push(`Battery started with: ${readNumber('essentialsStartSet') > 0 ? `${kinds(metaOf(ESSENTIALS_START_ID))} (noted ${timeOf(readNumber('essentialsStartSet'))})` : 'not noted yet'}`);
    // Left on the phone by the versions that counted apps by name; no longer read.
    if (tokenOf(OLD_ALL_ID) || tokenOf(COUNTED_ID)) lines.push(`Older lists, not in use: ${kinds(metaOf(OLD_ALL_ID))} shown; ${kinds(metaOf(COUNTED_ID))} counted`);
    lines.push(`Asked to cover: ${kinds(DeviceActivity.activitySelectionMetadata({ currentBlocklist: true }))}`);
    lines.push(`Kept open whatever is covered: ${kinds(DeviceActivity.activitySelectionMetadata({ currentWhitelist: true }))}`);
    lines.push(`Phone says covers are up: ${DeviceActivity.isShieldActive() ? 'yes' : 'no'}`);
    lines.push(`Last problem: ${readString('problem') || 'none'}`);
    return lines;
  } catch (error) {
    return [`Could not read: ${String(error)}`];
  }
}

/**
 * What Apple's usage report on Today should cover: from when today's count
 * began to the next recharge, every app (no selection). The report is drawn
 * by the phone; none of what it shows comes back to the app. `exact`: the
 * phone's own total for those hours is the day's figure, which holds only
 * with no essentials. The report is handed either every app or a list, never
 * "every app but these", and it runs sealed off from the essentials.
 */
export function reportWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; selection: string | null; fromRecharge: boolean; exact: boolean } {
  const periodStart = periodStartOf(now, settings.rechargeMinute);
  const from = dayStartOf(periodStart);
  return { fromMs: from.getTime(), toMs: nextRecharge(now, settings.rechargeMinute).getTime(), selection: null, fromRecharge: from.getTime() === periodStart.getTime(), exact: SCREEN_TIME_AVAILABLE && !hasEssentials() };
}

/**
 * The seven days before today's battery and today's battery itself, for the
 * phone's one picture in setup (today's figure, the 7-day average and the
 * chart; targets/report/PlainlimitReport.swift, SetupReport). The report takes
 * the first seven days from the start as the week and the rest as today.
 * Every app (no selection); the report itself leaves out essentials that are
 * already chosen.
 */
export function setupWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; selection: string | null } {
  const periodStart = periodStartOf(now, settings.rechargeMinute);
  return { fromMs: periodStart.getTime() - 7 * 24 * 3600 * 1000, toMs: nextRecharge(now, settings.rechargeMinute).getTime(), selection: null };
}

/**
 * The iPhone's whole day, every app, for setup's last screen (the phone's
 * "Whole" figure; targets/report/PlainlimitReport.swift, WholeReport): from
 * the midnight before today's battery began to the next recharge, so the
 * figure always takes in what Plainlimit counts. That midnight is today's,
 * as in the iPhone's own Screen Time, but in the small hours before the
 * recharge, when the battery began the day before (`sinceYesterday`).
 */
export function wholeWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; sinceYesterday: boolean } {
  const start = periodStartOf(now, settings.rechargeMinute);
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { fromMs: midnight.getTime(), toMs: nextRecharge(now, settings.rechargeMinute).getTime(), sinceYesterday: midnight.getTime() < today.getTime() };
}

/**
 * The last seven days up to the end of this hour, every app, for the phone's
 * list of the apps opened first after a pickup (Second thought's suggestions;
 * targets/report/PlainlimitReport.swift, FirstAppsReport). No selection: the
 * report names no apps, so it counts them all.
 */
export function pickupWindow(now: Date): { fromMs: number; toMs: number; selection: null } {
  const hour = 3600 * 1000;
  const toMs = Math.ceil((now.getTime() + 1) / hour) * hour;
  return { fromMs: toMs - 7 * 24 * hour, toMs, selection: null };
}

/** For setup's last screen: whether the day's figure has settled after the latest change (see `roundSettled`). */
export function countSettled(settings: Settings): boolean {
  if (!SCREEN_TIME_AVAILABLE) return true;
  try {
    return roundSettled(phoneReports(), rounds(), dayStartOf(periodStartOf(new Date(), settings.rechargeMinute)).getTime(), Date.now());
  } catch {
    return true;
  }
}

/**
 * Counting is on but nothing locks until `untilMs`: setup's "start tomorrow",
 * when today was already past the goal. The day's checkpoints still arrive and
 * fill the battery; the phone is told not to act on them before then.
 */
export function holdLocks(untilMs: number, settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    save('holdUntil', untilMs);
    writeCheckpointActions(planFor(settings, topUpsSoFar), settings, new Date());
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    // Taking every cover off takes the Ask first list's too; it goes back on unless it is open.
    coverAskAgain(settings.askFirst);
  } catch (error) {
    note('holding the locks', error);
  }
}

/** The latest checkpoint report since `ms`, or null if none has come yet. */
export function lastReportSince(ms: number): number | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  try {
    const times = COUNTING.flatMap((activity) => DeviceActivity.getEvents(activity))
      .filter((e) => e.callbackName === 'eventDidReachThreshold')
      .map((e) => e.lastCalledAt.getTime())
      .filter((at) => at >= ms);
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/** When held locks act again (0 if they aren't held). */
export function locksHeldUntil(): number {
  if (MOCK_PHONE && MOCK.has('held')) return Date.now() + 6 * 3600 * 1000;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  const until = holdUntil();
  return until > Date.now() ? until : 0;
}

/** Calls back whenever the phone reports a checkpoint while the app is open. */
export function onCheckpoint(listener: () => void): () => void {
  if (!SCREEN_TIME_AVAILABLE) return () => {};
  try {
    const subscription = DeviceActivity.onDeviceActivityMonitorEvent(() => listener());
    return () => subscription.remove();
  } catch (error) {
    // The app still looks every 20 seconds and on every return to it.
    note('onCheckpoint', error);
    return () => {};
  }
}

/**
 * The sums were solved (or an emergency pass used): uncover the apps now, and
 * have the phone cover them again at `until`, by the clock, however much or
 * little they are used in between. If that is at or past the recharge, the
 * day's own ending takes over and nothing more is scheduled.
 *
 * Until then no checkpoint covers anything. The day can be registered again
 * in the meantime (an emergency pass opens the settings: new essentials, a
 * new goal), and the phone then reports again the checkpoints already passed,
 * which would cover the apps in the middle of the time just given.
 */
export async function grantExtraTime(until: Date, settings: Settings, topUpsAfter: number, now: Date): Promise<void> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    // Taking every cover off takes the Ask first list's too; it goes back on unless it is open.
    coverAskAgain(settings.askFirst);

    const plan = planFor(settings, topUpsAfter);
    const empty = plan.shields.find((s) => s.id === 'empty');
    if (empty) writeShield(empty, topUpsAfter);

    save('earnedUntil', until.getTime());
    // The checkpoints as the phone has them registered, with that in their "never before" times.
    writeCheckpointActions(planFor({ ...settings, goalMinutes: roundGoal(settings.goalMinutes) }, topUpsAfter), settings, now);

    stopEarnedTimer();
    const dayEnds = nextRecharge(now, settings.rechargeMinute).getTime() - 60_000;
    if (until.getTime() >= dayEnds || until.getTime() <= now.getTime()) return;

    DeviceActivity.configureActions({ activityName: TOPUP_ACTIVITY, callbackName: 'intervalDidEnd', actions: [coverAction('empty'), STOP_EARNED_TIME] });
    const window = topUpWindow(until);
    await DeviceActivity.startMonitoring(TOPUP_ACTIVITY, { intervalStart: window.start, intervalEnd: window.end, repeats: true }, []);
    if (!DeviceActivity.getActivities().includes(TOPUP_ACTIVITY)) note('earned time', 'the phone did not keep the timer');
  } catch (error) {
    // The apps are uncovered; the app covers them again itself the next time it is opened after `until`.
    note('earned time', error);
  }
}

/**
 * Stops the timer that covers the apps when earned time ends, without it
 * covering them: the phone reports an end for a timer stopped while it runs
 * (Apple's documentation), so its end is told to do nothing first.
 */
function stopEarnedTimer() {
  DeviceActivity.configureActions({ activityName: TOPUP_ACTIVITY, callbackName: 'intervalDidEnd', actions: [] });
  DeviceActivity.stopMonitoring([TOPUP_ACTIVITY]);
}

/**
 * Ends earned time (or an emergency pass) early, covering nothing: the
 * battery has charge again and holds out longer (a pass let today's goal go
 * up). From now the battery's own checkpoints cover the apps when it is empty;
 * the caller registers the day again, which writes them without the wait.
 */
export function endExtraTime() {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    forget('earnedUntil');
    stopEarnedTimer();
  } catch (error) {
    note('ending earned time', error);
  }
}

/**
 * Covers everything but the essentials with the empty screen, now. The app
 * calls this when it is open and sees that the covers should be up and the
 * phone has not put them there: earned time has run out and its timer did
 * not fire, or the day was registered with the battery already empty.
 * `noted`: the phone is told the battery's lock has acted, so its later
 * checkpoints past the goal don't put the covers back after a "warn" screen
 * was tapped away (tally.ts, the "lock" mark).
 */
export function coverEmptyNow(settings: Settings, topUpsSoFar: number, noted = true) {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    const plan = planFor(settings, topUpsSoFar);
    const empty = plan.shields.find((s) => s.id === 'empty');
    if (!empty) return;
    const { look, buttons } = shieldParts(empty, topUpsSoFar);
    DeviceActivity.updateShieldWithId(look, buttons, empty.id);
    DeviceActivity.updateShield(look, buttons, 'plainlimit');
    keepEssentialsOpen();
    DeviceActivity.enableBlockAllMode('plainlimit');
    if (noted) DeviceActivity.userDefaultsSet(`${DONE_PREFIX}lock~${round()}`, Date.now());
  } catch {
    // Nothing more to do.
  }
}

/**
 * Setup is done and the person has seen the starting figure: let the locks act
 * from now on and, if the battery was already empty before Plainlimit was
 * installed, cover the counted apps now. (A checkpoint reported while the
 * locks were held is not reported again.)
 */
export function releaseLocks(settings: Settings, topUpsSoFar: number, usedFloorNow: number) {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    forget('holdUntil');
    writeCheckpointActions(planFor(settings, topUpsSoFar), settings, new Date());
    if (usedFloorNow >= settings.goalMinutes) coverEmptyNow(settings, topUpsSoFar);
  } catch (error) {
    note('starting', error);
  }
}

export { COUNTED_ID };

/**
 * Test builds only: puts the empty battery's covers up now, whatever the
 * battery holds, so the lock can be tried in seconds instead of after a whole
 * day's use. `testUncover` takes them down again.
 */
export function testCover(settings: Settings, topUpsSoFar: number): void {
  coverEmptyNow(settings, topUpsSoFar, false);
}

export function testUncover(settings: Settings): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    DeviceActivity.disableBlockAllMode('plainlimit test');
    DeviceActivity.resetBlocks('plainlimit test');
    // Taking every cover off takes the Second thought list's too; it goes back on unless it is open.
    coverAskAgain(settings.askFirst);
  } catch (error) {
    note('testUncover', error);
  }
}
