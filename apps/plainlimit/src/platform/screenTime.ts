import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldAction, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { GUARD_MS, guardFor, roundName, splitName, mostByNow, type Noted } from '@/domain/checkpoints';
import { countDay, doubtful, miscounted, roundSettled, type Report, type Rounds } from '@/domain/reports';
import { nextRecharge, periodStart as periodStartOf } from '@/domain/day';
import {
  ACTIVITY,
  COUNTED_ID,
  TICKS_ACTIVITY,
  TOPUP_ACTIVITY,
  countStart,
  lockNotBefore,
  includesEarlierUse,
  monitorPlan,
  puzzleNotice,
  topUpWindow,
  type ButtonEffect,
  type PlanAction,
  type PlanShield,
} from '@/domain/monitorPlan';
import { ASK_ID } from '@/domain/askFirst';
import type { WidgetRecord } from '@/domain/pro';
import type { Settings } from '@/domain/types';

import { askCoverActions, coverAskAgain, stopAskFirst } from './askFirst';
import { countingSince, forget, holdUntil, noted, picksChangedAt, readLines, readNumber, readNumberOrNull, readString, registeredAt, round, save, SAVED, savedGuard } from './saved';

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
 * ("nothingPicked", "tooManyApps", "accessOff", "notRegistered", "miscounted"),
 * "held" (setup's "start tomorrow": nothing locks before the recharge),
 * "noAskPicks" (nothing picked yet for Second thought),
 * "covered" (the covering screen was last drawn for Snapchat, and opening an
 * app is only noted on the page) and
 * "store" (the App Store screenshots: no test tools, and no box for the list
 * only a phone can draw). Never on a phone.
 */
const MOCK: ReadonlySet<string> = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return new Set<string>();
  try {
    return new Set((new URLSearchParams(window.location.search).get('mock') ?? '').split(',').filter(Boolean));
  } catch {
    return new Set<string>();
  }
})();

/** Preview only: the address asks to stand in for a phone that is counting. */
export const MOCK_PHONE = MOCK.has('counting');

/** Preview only: the covering screen was last drawn for an app Plainlimit can open again (src/platform/backToApp.ts). */
export const MOCK_COVERED = MOCK.has('covered');

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

/** Shows Apple's "allow Screen Time access" sheet. */
export async function askPermission(): Promise<Permission> {
  if (!SCREEN_TIME_AVAILABLE) return 'unknown';
  try {
    // Shows nothing when access is already on; otherwise Apple's sheet.
    await DeviceActivity.requestAuthorization('individual');
    sheetAnswer = 'approved';
  } catch {
    // Declined, or Screen Time is switched off on this phone.
    sheetAnswer = 'denied';
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
  if (MOCK_PHONE) return MOCK.has('nothingPicked') || (id === ASK_ID && MOCK.has('noAskPicks')) ? 0 : id === COUNTED_ID ? 14 : 3;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  try {
    const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionId: id });
    return meta ? meta.applicationCount + meta.categoryCount + sitesIn(meta) : 0;
  } catch {
    return 0;
  }
}

/**
 * The essentials model (1.1). The person ticks only their essentials, and the
 * phone locks everything else by category ("all, except these"), which has no
 * 50-app limit on what is locked. Two lists are kept besides the counted one:
 * - ALL_ID: Apple's list with everything ticked once, so Plainlimit holds the
 *   phone's apps. Apple can count "these apps" but not "all but these".
 * - ESSENTIALS_ID: the apps that never count and never lock (50 at most: the
 *   limit now falls on the short list).
 * The counted list (COUNTED_ID) is worked out from them: every app shown, less
 * the essentials. Until both exist, a list made by an older version (ticked
 * apps count and lock) goes on working as it did.
 */
export const ALL_ID = 'plall';
export const ESSENTIALS_ID = 'plkeep';
/** The most apps iOS will leave out of an "everything" lock. */
export const ESSENTIALS_LIMIT = 50;

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

/** Puts a list back as it was ('' means there was none). */
function putBack(id: string, token: string) {
  if (token !== '') {
    DeviceActivity.setFamilyActivitySelectionId({ id, familyActivitySelection: token });
    return;
  }
  const all = DeviceActivity.userDefaultsGet<Record<string, string>>('familyActivitySelectionIds') ?? {};
  const rest = { ...all };
  delete rest[id];
  DeviceActivity.userDefaultsSet('familyActivitySelectionIds', rest);
}

const MOCK_OLD_LIST = () => MOCK.has('nothingPicked') || MOCK.has('tooManyApps') || MOCK.has('oldList');

/** How many apps the phone has shown Plainlimit (0: not shown yet). */
export function appsShown(): number {
  if (MOCK_PHONE) return MOCK_OLD_LIST() ? 0 : 120;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  return metaOf(ALL_ID)?.applicationCount ?? 0;
}

/** How many essentials are ticked. */
export function essentialsCount(): number {
  if (MOCK_PHONE) return MOCK_OLD_LIST() ? 0 : 14;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  const meta = metaOf(ESSENTIALS_ID);
  return meta ? meta.applicationCount + sitesIn(meta) : 0;
}

/** Whether the essentials model is in use: the apps were shown and the essentials chosen (none is a choice too). */
export function essentialsMode(): boolean {
  if (MOCK_PHONE) return !MOCK_OLD_LIST();
  if (!SCREEN_TIME_AVAILABLE) return false;
  return readNumber('essentialsSet') > 0 && appsShown() > 0;
}

/**
 * The same picks with no whole categories and no websites: only the apps one
 * by one. Null if the phone's format isn't as expected. (Websites: Apple's
 * list with everything ticked also holds the sites the phone knows, 23 on the
 * owner's. Left in, time on them counted in whatever browser showed them, an
 * essential one too: build 95 counted Brave though it was ticked as one.)
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
 * Works out what counts: every app shown, less the essentials, as single apps.
 * Whole categories are left out on purpose: a category would count the
 * essentials inside it too (the fault of the first "always allowed" list, up
 * to build 47). If they can't be left out, the list is kept with them and the
 * readout says so.
 */
function deriveCounted(): boolean {
  try {
    if ((metaOf(ALL_ID)?.applicationCount ?? 0) === 0) return false;
    const rest = DeviceActivity.difference({ activitySelectionId: ALL_ID }, { activitySelectionId: ESSENTIALS_ID }, {});
    const token = rest?.familyActivitySelection;
    if (!rest || typeof token !== 'string' || token === '') {
      note('the counted list', 'the phone gave no list');
      return false;
    }
    let counted = token;
    const apps = appsOnly(token);
    const check = apps ? DeviceActivity.activitySelectionMetadata({ activitySelectionToken: apps }) : null;
    if (apps && check && check.categoryCount === 0 && sitesIn(check) === 0 && check.applicationCount === rest.applicationCount) counted = apps;
    else note('the counted list', 'whole categories and websites could not be left out, so an essential may still count');
    DeviceActivity.setFamilyActivitySelectionId({ id: COUNTED_ID, familyActivitySelection: counted });
    // A screen kept for this list by the older model would be shown in place of the current one.
    DeviceActivity.userDefaultsRemove(`shieldConfigurationForSelection_${COUNTED_ID}`);
    DeviceActivity.userDefaultsRemove(`shieldActionsForSelection_${COUNTED_ID}`);
    return true;
  } catch (error) {
    note('the counted list', error);
    return false;
  }
}

/**
 * Tells the phone which apps stay open whatever is locked: the essentials, or
 * none under the older single list (where what is not ticked never locks).
 */
function keepEssentialsOpen(mode: boolean) {
  try {
    if (!mode) {
      DeviceActivity.clearWhitelist();
      return;
    }
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

/** Call as Apple's picker opens on the phone's whole list of apps. */
export function appsBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  picksBefore();
  try {
    save('appsBefore', tokenOf(ALL_ID));
  } catch {
    // Without it an emptied list can't be put back.
  }
}

/** Call as that picker closes. An emptied list is not kept. */
export function appsAfter(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    const before = readString('appsBefore');
    forget('appsBefore');
    if ((metaOf(ALL_ID)?.applicationCount ?? 0) === 0 && before !== '') putBack(ALL_ID, before);
    if (readNumber('essentialsSet') > 0) deriveCounted();
  } catch (error) {
    note('the app list', error);
  }
}

/** Call as Apple's picker opens on the essentials. */
export function essentialsBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  picksBefore();
  try {
    save('essentialsBefore', tokenOf(ESSENTIALS_ID));
  } catch {
    // Without it a list that is too long can't be put back.
  }
}

/**
 * Call as that picker closes. More essentials than iOS can keep open are not
 * kept: the list from before goes back, and the number ticked is returned so
 * the screen can say so (0 when the list was kept).
 */
export function essentialsAfter(): number {
  if (!SCREEN_TIME_AVAILABLE) return 0;
  try {
    const before = readString('essentialsBefore');
    forget('essentialsBefore');
    const ticked = metaOf(ESSENTIALS_ID)?.applicationCount ?? 0;
    if (ticked > ESSENTIALS_LIMIT) {
      putBack(ESSENTIALS_ID, before);
      return ticked;
    }
    if (appsShown() === 0) return 0;
    save('essentialsSet', Date.now());
    deriveCounted();
    keepEssentialsOpen(true);
    return 0;
  } catch (error) {
    note('the essentials', error);
    return 0;
  }
}

/** Sites in a selection. The library's type says "webDomainCount"; its native side sends "webdomainCount". */
function sitesIn(meta: DeviceActivity.ActivitySelectionMetadata): number {
  const raw = meta as unknown as Record<string, unknown>;
  const n = raw.webdomainCount ?? raw.webDomainCount;
  return typeof n === 'number' ? n : 0;
}

/**
 * The most apps iOS will lock one by one. With 51 or more in the list it locks
 * none of them (Apple's forums; seen Nov 16 at 12:05 AM on build 68: the battery
 * was empty and most counted apps still opened). Whole categories are locked
 * as categories and have no such limit, so they don't count towards it.
 */
export const APP_LOCK_LIMIT = 50;
// Spreading single apps over several named settings stores does not get round
// it: build 89 put 50 in the usual store and 36 in a second, and the single
// apps still opened while the 5 ticked categories locked (the owner's phone,
// Nov 18). Unticking one app inside a ticked category makes Apple's picker
// list the rest of that category one by one, so the limit is easy to pass.

/**
 * Whether the counted picks hold more single apps than iOS will lock. Only a
 * list from the older model can: with essentials, the lock is by category.
 */
export function tooManyApps(): boolean {
  if (MOCK_PHONE) return MOCK.has('tooManyApps');
  if (!SCREEN_TIME_AVAILABLE) return false;
  if (essentialsMode()) return false;
  try {
    return (DeviceActivity.activitySelectionMetadata({ activitySelectionId: COUNTED_ID })?.applicationCount ?? 0) > APP_LOCK_LIMIT;
  } catch {
    return false;
  }
}

/**
 * Picks made before build 71 were kept "with every app of each ticked
 * category" (Apple's includeEntireCategory), which put every app of a ticked
 * category in the list of single apps, usually far over iOS's lock limit. When
 * switching that off alone brings the list under the limit with the same
 * categories, the picks are rewritten that way; otherwise they have to be made
 * again ("pickAgain"). Nothing changes when the picks are fine.
 */
export function fixOldPicks(): 'fine' | 'fixed' | 'pickAgain' {
  if (!SCREEN_TIME_AVAILABLE) return 'fine';
  if (essentialsMode()) {
    // A counted list worked out by builds 90 to 95 still holds websites: work it out again without them.
    try {
      const counted = metaOf(COUNTED_ID);
      if (!counted || sitesIn(counted) === 0) return 'fine';
      picksBefore();
      return deriveCounted() ? 'fixed' : 'fine';
    } catch (error) {
      note('fixOldPicks', error);
      return 'fine';
    }
  }
  try {
    const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionId: COUNTED_ID });
    if (!meta || meta.applicationCount <= APP_LOCK_LIMIT) return 'fine';
    const token = DeviceActivity.getFamilyActivitySelectionId(COUNTED_ID);
    if (meta.includeEntireCategory && typeof token === 'string' && token.length > 0) {
      const picks = JSON.parse(atob(token)) as Record<string, unknown>;
      if (picks.includeEntireCategory === true) {
        const rewritten = btoa(JSON.stringify({ ...picks, includeEntireCategory: false }));
        const after = DeviceActivity.activitySelectionMetadata({ activitySelectionToken: rewritten });
        if (after && after.applicationCount <= APP_LOCK_LIMIT && after.categoryCount === meta.categoryCount && after.applicationCount + after.categoryCount + sitesIn(after) > 0) {
          picksBefore();
          DeviceActivity.setFamilyActivitySelectionId({ id: COUNTED_ID, familyActivitySelection: rewritten });
          return 'fixed';
        }
      }
    }
    return 'pickAgain';
  } catch (error) {
    note('fixOldPicks', error);
    return 'pickAgain';
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
 * Notes, while counting works, the most that can have been used by now (see
 * `mostByNow`). Nothing is noted once the goal is passed.
 */
export function noteKnown(settings: Settings, usedFloorNow: number, now = new Date()) {
  if (!SCREEN_TIME_AVAILABLE) return;
  // Right after counting is set up the phone is still sending reports for time
  // already used, so "not reported yet" does not yet mean "not reached yet".
  // And the figure noted before the registration is the one guarding it.
  if (now.getTime() - registeredAt() < GUARD_MS) return;
  const most = mostByNow(roundGoal(settings.goalMinutes), usedFloorNow);
  if (most === null) return;
  try {
    save('noted', { at: now.getTime(), most } satisfies Noted);
  } catch {
    // Without it the guard falls back to the time since the recharge.
  }
}

/**
 * Starts a new round of checkpoint names (roundName). Done whenever reports
 * already made would mean something else: the ticked apps changed, or the goal
 * did ("cell-3" is 90 minutes of a 3-hour goal, 120 of a 4-hour one).
 */
function startRound(now: Date, goalBefore: number) {
  // Only the round now ending is still read (as the previous one, while the
  // phone re-reports); reports from any older round are no use any more.
  const ending = round();
  try {
    for (const e of [...DeviceActivity.getEvents(ACTIVITY), ...DeviceActivity.getEvents(TICKS_ACTIVITY)]) {
      if (e.callbackName !== 'eventDidReachThreshold' || !e.eventName) continue;
      if (splitName(e.eventName).round !== ending) DeviceActivity.userDefaultsRemove(`events_${e.activityName}_eventDidReachThreshold_${e.eventName}`);
    }
  } catch {
    // Tidying only.
  }
  save('roundBefore', ending);
  save('roundGoalBefore', goalBefore);
  save('round', now.getTime().toString(36));
  save('picksChangedAt', now.getTime());
}

/** Call as Apple's picker opens. */
export function picksBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    save('picksBefore', countedToken() ?? '');
  } catch {
    // Without it, closing the picker changes nothing about today's count.
  }
}

/** Call as Apple's picker closes, before the day is registered again. True if the list changed. */
export function picksAfter(goalMinutes: number, now = new Date()): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    const before = readString('picksBefore');
    forget('picksBefore');
    if (before === '' || before === (countedToken() ?? '')) return false;
    // A new round of names, so reports for the old list can't pass for the new one.
    startRound(now, roundGoal(goalMinutes));
    // The last known figure was for the old list. A newly ticked app can
    // honestly add more than it allowed, so it is dropped; a new one is noted
    // once counting has settled again.
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

/**
 * With essentials: everything is covered except them (the phone holds the
 * list of what stays open, see `keepEssentialsOpen`). Under the older single
 * list: only the ticked apps are covered.
 */
function coverAction(shield: string, mode = essentialsMode()): Action {
  if (mode) return { type: 'enableBlockAllMode', shieldId: shield };
  return { type: 'blockSelection', familyActivitySelectionId: COUNTED_ID, shieldId: shield };
}

function toAction(action: PlanAction, mode: boolean): Action {
  if (action.kind === 'cover') return coverAction(action.shield, mode);
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
 */
function writeCheckpointActions(plan: ReturnType<typeof monitorPlan>, settings: Settings, now: Date) {
  const dayStart = dayStartOf(periodStartOf(now, settings.rechargeMinute));
  const guard = savedGuard();
  const held = holdUntil();
  const named = round();
  const mode = essentialsMode();
  for (const event of plan.events) {
    const notBefore = new Date(Math.max(lockNotBefore(dayStart, guard, event.minutes).getTime(), held));
    DeviceActivity.configureActions({
      activityName: plan.activity,
      callbackName: 'eventDidReachThreshold',
      eventName: roundName(event.name, named),
      actions: event.actions.map((a) => ({ ...toAction(a, mode), neverTriggerBefore: notBefore })),
    });
  }
}

/**
 * Writes the covering screens' look and words, and what happens at each
 * checkpoint, again, and nothing else. Called when the app starts or comes to
 * the front, so that an update reaches the phone without the day having to be
 * registered again (which on a first day would restart the count).
 */
export function refreshScreens(settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE || !isOn()) return;
  try {
    const plan = monitorPlan(settings, topUpsSoFar, countingSince());
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);
    // Today's "not before" times, so the guard against early checkpoints holds on each day the app is opened.
    writeCheckpointActions(plan, settings, new Date());
  } catch (error) {
    note('the screens', error);
  }
}

/**
 * The token for what counts: the apps and categories ticked in Apple's list.
 * None at all means nothing is counted, never "everything".
 */
function countedToken(): string | null {
  if (pickCount(COUNTED_ID) === 0) return null;
  return DeviceActivity.getFamilyActivitySelectionId(COUNTED_ID) ?? null;
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
    return await registerPlan(settings, topUpsSoFar, fresh, hold);
  } finally {
    registering -= 1;
    registerFinishedAt = Date.now();
  }
}

async function registerPlan(settings: Settings, topUpsSoFar: number, fresh: boolean, hold: boolean): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return false;
  try {
    const now = new Date();
    const token = countedToken();
    if (token === null) {
      // Nothing is ticked, so nothing can count or lock.
      DeviceActivity.stopMonitoring([ACTIVITY, TICKS_ACTIVITY]);
      note('the day', 'nothing is ticked in What counts');
      return false;
    }
    // Held for two hours at most, in case setup is left half done.
    if (hold) save('holdUntil', now.getTime() + 2 * 3600 * 1000);
    else if (fresh) forget('holdUntil');
    save('registeredAt', now.getTime());
    // A different goal gives the same checkpoint names other minutes, and a
    // different recharge time counts them from another moment.
    const lastGoal = readNumber('registeredGoal');
    const lastRecharge = readNumberOrNull('registeredRecharge');
    const goalMoved = lastGoal > 0 && lastGoal !== settings.goalMinutes;
    const rechargeMoved = lastRecharge !== null && lastRecharge !== settings.rechargeMinute;
    if (!fresh && (goalMoved || rechargeMoved)) startRound(now, lastGoal > 0 ? lastGoal : settings.goalMinutes);
    save('registeredGoal', settings.goalMinutes);
    save('registeredRecharge', settings.rechargeMinute);
    if (fresh) {
      // Counting starts (or starts over) now: forget earlier checkpoints and take every cover away.
      DeviceActivity.stopMonitoring([ACTIVITY, TICKS_ACTIVITY, TOPUP_ACTIVITY]);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TICKS_ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TOPUP_ACTIVITY}`);
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
    const plan = monitorPlan(settings, topUpsSoFar, since);
    const earlier = includesEarlierUse(periodStartOf(now, settings.rechargeMinute), since);
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);

    // The essentials stay open whatever is locked. (Under the older single list nothing needs to: what is not ticked never locks.)
    keepEssentialsOpen(essentialsMode());

    writeCheckpointActions(plan, settings, now);
    // The screens come off when the day ends, a minute before the next one starts.
    // ...and the Ask first list's cover goes back on (askFirst.ts).
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'intervalDidEnd', actions: [...UNCOVER, STOP_EARNED_TIME, ...askCoverActions(settings.askFirst)] });

    const named = round();
    save('widgetPlan', { ...plan.widget, round: named, roundBefore: readString('roundBefore'), picksChangedAt: picksChangedAt() });

    await DeviceActivity.startMonitoring(
      plan.activity,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.events.map((event) => ({ eventName: roundName(event.name, named), familyActivitySelection: token, threshold: event.after, includesPastActivity: earlier })),
    );
    await registerTicks(plan, token, earlier, named);
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
async function registerTicks(plan: ReturnType<typeof monitorPlan>, token: string, earlier: boolean, named: string) {
  try {
    if (plan.ticks.length === 0) {
      DeviceActivity.stopMonitoring([TICKS_ACTIVITY]);
      return;
    }
    await DeviceActivity.startMonitoring(
      TICKS_ACTIVITY,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.ticks.map((tick) => ({ eventName: roundName(tick.name, named), familyActivitySelection: token, threshold: tick.after, includesPastActivity: earlier })),
    );
  } catch (error) {
    note('the minute checkpoints', error);
  }
}

/** How the day's counting stands. Only ever not 'fine' when counting is meant to be on. */
export type Health = 'fine' | 'nothingPicked' | 'tooManyApps' | 'accessOff' | 'notRegistered' | 'miscounted';

/**
 * Whether the day is really being counted. `watching` is whether the person
 * has counting turned on; turning it off on purpose is not a fault.
 * - nothingPicked: nothing is ticked in What counts, so nothing can count.
 * - accessOff: Screen Time access has been taken away in the Settings app.
 * - notRegistered: the phone has forgotten the day's monitoring.
 * - miscounted: the phone reported a checkpoint too soon to be true (see `miscounted`).
 */
export function health(settings: Settings, periodStart: Date, watching: boolean): Health {
  if (MOCK_PHONE) return (['nothingPicked', 'tooManyApps', 'accessOff', 'notRegistered', 'miscounted'] as const).find((h) => MOCK.has(h)) ?? 'fine';
  if (!SCREEN_TIME_AVAILABLE || !watching) return 'fine';
  if (permission() !== 'approved') return 'accessOff';
  try {
    if (pickCount(COUNTED_ID) === 0) return 'nothingPicked';
    if (!DeviceActivity.getActivities().includes(ACTIVITY)) return 'notRegistered';
    if (tooManyApps()) return 'tooManyApps';
    return miscounted(phoneReports([ACTIVITY]), roundGoal(settings.goalMinutes), round(), dayStartOf(periodStart), savedGuard()) ? 'miscounted' : 'fine';
  } catch {
    return 'fine';
  }
}

/** Every checkpoint report the phone has kept for these activities. */
function phoneReports(activities: string[] = [ACTIVITY, TICKS_ACTIVITY]): Report[] {
  return activities
    .flatMap((activity) => DeviceActivity.getEvents(activity))
    .filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName)
    .map((e) => ({ name: e.eventName as string, at: e.lastCalledAt.getTime() }));
}

/** The day's rounds of checkpoint names, as saved on the phone. */
function rounds(): Rounds {
  return { round: round(), roundBefore: readString('roundBefore'), goalBefore: readNumber('roundGoalBefore'), picksChangedAt: picksChangedAt() };
}

/**
 * After a miscount: forgets the reports that could not be true, so the phone
 * may make them again, and registers the day afresh. What was used since the
 * recharge still counts.
 */
export async function countAgain(settings: Settings, topUpsSoFar: number, periodStart: Date): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    for (const report of doubtful(phoneReports([ACTIVITY]), roundGoal(settings.goalMinutes), round(), dayStartOf(periodStart), savedGuard())) {
      DeviceActivity.userDefaultsRemove(`events_${ACTIVITY}_eventDidReachThreshold_${report.name}`);
    }
  } catch (error) {
    note('counting again', error);
  }
  return applyPlan(settings, topUpsSoFar);
}

/** Stops counting and takes any covering screen away. */
export function turnOff() {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    DeviceActivity.stopMonitoring([ACTIVITY, TICKS_ACTIVITY, TOPUP_ACTIVITY]);
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    stopAskFirst();
    forget('widgetPlan');
    forget('countingSince');
    reloadWidget();
  } catch {
    // Nothing more to do.
  }
}

/**
 * The minutes known to be used since the last recharge, from the checkpoints
 * the phone has reported. Checkpoints that arrive impossibly early are ignored.
 */
export function usedSoFar(goalMinutes: number, periodStart: Date, periodEnd?: Date): number | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  try {
    return countDay({
      reports: phoneReports(),
      goalMinutes: roundGoal(goalMinutes),
      dayStart: dayStartOf(periodStart).getTime(),
      periodEnd: periodEnd?.getTime(),
      rounds: rounds(),
      guard: savedGuard(),
      now: Date.now(),
    });
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
    lines.push(`Registered at: ${timeOf(registeredAt())}${guard ? `; reports until ${timeOf(guard.closes)} judged from ${timeOf(guard.from)}` : ''}`);
    lines.push(`Health: ${health(settings, periodStartOf(new Date(), settings.rechargeMinute), true)}`);
    lines.push(`Registered: ${DeviceActivity.getActivities().join(', ') || 'nothing'}`);
    const from = dayStartOf(periodStartOf(new Date(), settings.rechargeMinute));
    const ignored = new Set(doubtful(phoneReports([ACTIVITY]), roundGoal(settings.goalMinutes), round(), from, guard).map((r) => r.name));
    const reported = DeviceActivity.getEvents()
      .filter((e) => e.activityName === ACTIVITY || e.activityName === TOPUP_ACTIVITY)
      .map((e) => {
        const early = e.activityName === ACTIVITY && e.eventName !== undefined && e.eventName !== null && ignored.has(e.eventName);
        return `${e.eventName ?? e.callbackName}: ${timeOf(e.lastCalledAt.getTime())}${early ? ' (too early to be true, ignored)' : ''}`;
      });
    lines.push(reported.length ? `Reported by the phone:\n  ${reported.join('\n  ')}` : 'Reported by the phone: nothing yet');
    lines.push(`Monitor asked for a widget redraw: ${timeOf(readNumber('reloadAsked'))}`);
    const cells = DeviceActivity.userDefaultsGet<number>(SAVED.widgetCells);
    lines.push(`Widget last drew: ${timeOf(readNumber('widgetDrew'))}${typeof cells === 'number' ? ` (${cells < 0 ? 'not set up' : `${cells} cells`})` : ''}`);
    lines.push(`Picked: ${pickCount(COUNTED_ID)} counted${picksChangedAt() > 0 ? `, last changed ${timeOf(picksChangedAt())} (round ${round() || 'first'})` : ''}`);
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
    lines.push(`Lock: ${essentialsMode() ? 'everything except your essentials' : 'the older ticked list'}`);
    lines.push(`Apps shown: ${kinds(metaOf(ALL_ID))}`);
    lines.push(`Essentials: ${kinds(metaOf(ESSENTIALS_ID))}`);
    lines.push(`Counted: ${kinds(metaOf(COUNTED_ID))}`);
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
 * began to the next recharge, for the apps that count. The report is drawn by
 * the phone; none of what it shows comes back to the app.
 */
export function reportWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; selection: string | null; fromRecharge: boolean } {
  const periodStart = periodStartOf(now, settings.rechargeMinute);
  const from = dayStartOf(periodStart);
  const token = SCREEN_TIME_AVAILABLE ? countedToken() : null;
  return { fromMs: from.getTime(), toMs: nextRecharge(now, settings.rechargeMinute).getTime(), selection: token, fromRecharge: from.getTime() === periodStart.getTime() };
}

/** The seven days before today's battery, for the phone's 7-day average in setup. */
export function averageWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; selection: string | null } {
  const periodStart = periodStartOf(now, settings.rechargeMinute);
  const token = SCREEN_TIME_AVAILABLE ? countedToken() : null;
  return { fromMs: periodStart.getTime() - 7 * 24 * 3600 * 1000, toMs: periodStart.getTime(), selection: token };
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
    writeCheckpointActions(monitorPlan(settings, topUpsSoFar, countingSince()), settings, new Date());
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
    const times = [...DeviceActivity.getEvents(ACTIVITY), ...DeviceActivity.getEvents(TICKS_ACTIVITY)]
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
 * The sums were solved: uncover the apps now, and have the phone cover them
 * again at `until`, by the clock, however much or little they are used in
 * between. If that is at or past the recharge, the day's own ending takes
 * over and nothing more is scheduled.
 */
export async function grantExtraTime(until: Date, settings: Settings, topUpsAfter: number, now: Date): Promise<void> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
    // Taking every cover off takes the Ask first list's too; it goes back on unless it is open.
    coverAskAgain(settings.askFirst);

    const plan = monitorPlan(settings, topUpsAfter, countingSince());
    const empty = plan.shields.find((s) => s.id === 'empty');
    if (empty) writeShield(empty, topUpsAfter);

    DeviceActivity.stopMonitoring([TOPUP_ACTIVITY]);
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
 * Covers the counted apps with the empty screen, now. The app calls this when
 * it is open and sees that earned time has run out, in case the phone's own
 * timer for it did not fire.
 */
export function coverEmptyNow(settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    const plan = monitorPlan(settings, topUpsSoFar, countingSince());
    const empty = plan.shields.find((s) => s.id === 'empty');
    if (!empty) return;
    const { look, buttons } = shieldParts(empty, topUpsSoFar);
    DeviceActivity.updateShieldWithId(look, buttons, empty.id);
    DeviceActivity.updateShield(look, buttons, 'plainlimit');
    if (essentialsMode()) {
      keepEssentialsOpen(true);
      DeviceActivity.enableBlockAllMode('plainlimit');
    } else {
      DeviceActivity.blockSelection({ activitySelectionId: COUNTED_ID }, 'plainlimit');
    }
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
    writeCheckpointActions(monitorPlan(settings, topUpsSoFar, countingSince()), settings, new Date());
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
  coverEmptyNow(settings, topUpsSoFar);
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
