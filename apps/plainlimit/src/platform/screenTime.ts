import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldAction, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { believable, checkpointsFor, GUARD_MS, knownFor, picksSettled, roundName, splitName, minuteTicksFor, miscounted, mostByNow, usedFloor, type Known, type Noted } from '@/domain/checkpoints';
import { nextRecharge, periodStart as periodStartOf } from '@/domain/day';
import {
  ACTIVITY,
  COUNTED_ID,
  TICKS_ACTIVITY,
  TOPUP_ACTIVITY,
  WIDGET_PLAN_KEY,
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
import type { Settings } from '@/domain/types';

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
 * "held" (setup's "start tomorrow": nothing locks before the recharge) and
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
export function pickCount(id: typeof COUNTED_ID): number {
  if (MOCK_PHONE) return MOCK.has('nothingPicked') ? 0 : 14;
  if (!SCREEN_TIME_AVAILABLE) return 0;
  try {
    const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionId: id });
    return meta ? meta.applicationCount + meta.categoryCount + sitesIn(meta) : 0;
  } catch {
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

/** Whether the counted picks hold more single apps than iOS will lock. */
export function tooManyApps(): boolean {
  if (MOCK_PHONE) return MOCK.has('tooManyApps');
  if (!SCREEN_TIME_AVAILABLE) return false;
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

/** Forgets the counted picks, so Apple's list opens empty and they are made again (see `fixOldPicks`). */
export function clearPicks(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    picksBefore();
    const all = DeviceActivity.userDefaultsGet<Record<string, string>>('familyActivitySelectionIds') ?? {};
    const rest = { ...all };
    delete rest[COUNTED_ID];
    DeviceActivity.userDefaultsSet('familyActivitySelectionIds', rest);
  } catch (error) {
    note('clearPicks', error);
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
  } catch (error) {
    note('coverAgain', error);
  }
  if (cover) coverEmptyNow(settings, topUpsSoFar);
}

/** Where the moment counting was turned on (or started over) is kept, in milliseconds. */
const SINCE_KEY = 'plainlimit_since';

function countingSince(): number | null {
  try {
    const value = DeviceActivity.userDefaultsGet<number>(SINCE_KEY);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Where the last known figure is kept (see `Noted` and `mostByNow`). */
const KNOWN_KEY = 'plainlimit_known';

function noted(): Noted | null {
  try {
    const value = DeviceActivity.userDefaultsGet<Noted>(KNOWN_KEY);
    return value && typeof value.at === 'number' && typeof value.most === 'number' ? value : null;
  } catch {
    return null;
  }
}

/** The guard for the latest registration (see `Known`): open for a few minutes after it. */
function known(): Known | null {
  return knownFor(noted(), registeredAt());
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
  const most = mostByNow(settings.goalMinutes, usedFloorNow);
  if (most === null) return;
  try {
    DeviceActivity.userDefaultsSet(KNOWN_KEY, { at: now.getTime(), most } satisfies Noted);
  } catch {
    // Without it the guard falls back to the time since the recharge.
  }
}

/** When the day was last registered with the phone. */
const REGISTERED_KEY = 'plainlimit_registered_at';

function registeredAt(): number {
  try {
    const value = DeviceActivity.userDefaultsGet<number>(REGISTERED_KEY);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Locks held back until this time, in milliseconds: setup holds them while it
 * shows the starting figure, so a false report from the phone at that moment
 * cannot lock anything before the person has seen it.
 */
const HOLD_KEY = 'plainlimit_hold_until';

function holdUntil(): number {
  try {
    const value = DeviceActivity.userDefaultsGet<number>(HOLD_KEY);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * When the ticked apps last changed, in milliseconds. Unticking an app takes
 * its time off today's battery and ticking it again puts it back: reports from
 * before the change were for the old list (countsAfterPicks), and the phone
 * re-reports the day so far for the new one within seconds of registering.
 */
const PICKS_KEY = 'plainlimit_picks_changed_at';
/** The ticked list as it was when Apple's picker opened, to tell whether closing it changed anything. */
const PICKS_BEFORE_KEY = 'plainlimit_picks_before';
/** The current round of checkpoint names, and the one before it (roundName). */
const ROUND_KEY = 'plainlimit_round';
const ROUND_BEFORE_KEY = 'plainlimit_round_before';

function readString(key: string): string {
  try {
    const value = DeviceActivity.userDefaultsGet<string>(key);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/** The round of checkpoint names the phone is counting under now. */
function round(): string {
  return readString(ROUND_KEY);
}

/** The goal the previous round's checkpoints were made for: a cell is a share of the goal, so its minutes depend on it. */
const ROUND_GOAL_BEFORE_KEY = 'plainlimit_round_goal_before';
/** The goal the day was last registered with. */
const REGISTERED_GOAL_KEY = 'plainlimit_registered_goal';

function readNumber(key: string): number {
  try {
    const value = DeviceActivity.userDefaultsGet<number>(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
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
  DeviceActivity.userDefaultsSet(ROUND_BEFORE_KEY, ending);
  DeviceActivity.userDefaultsSet(ROUND_GOAL_BEFORE_KEY, goalBefore);
  DeviceActivity.userDefaultsSet(ROUND_KEY, now.getTime().toString(36));
  DeviceActivity.userDefaultsSet(PICKS_KEY, now.getTime());
}

function picksChangedAt(): number {
  try {
    const value = DeviceActivity.userDefaultsGet<number>(PICKS_KEY);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Call as Apple's picker opens. */
export function picksBefore(): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    DeviceActivity.userDefaultsSet(PICKS_BEFORE_KEY, countedToken() ?? '');
  } catch {
    // Without it, closing the picker changes nothing about today's count.
  }
}

/** Call as Apple's picker closes, before the day is registered again. True if the list changed. */
export function picksAfter(goalMinutes: number, now = new Date()): boolean {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    const before = DeviceActivity.userDefaultsGet<string>(PICKS_BEFORE_KEY);
    DeviceActivity.userDefaultsRemove(PICKS_BEFORE_KEY);
    if (typeof before !== 'string' || before === (countedToken() ?? '')) return false;
    // A new round of names, so reports for the old list can't pass for the new one.
    startRound(now, goalMinutes);
    // The last known figure was for the old list. A newly ticked app can
    // honestly add more than it allowed, so it is dropped; a new one is noted
    // once counting has settled again.
    DeviceActivity.userDefaultsRemove(KNOWN_KEY);
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
const HISTORY_LOG_KEY = 'plainlimit_history_log';

export function noteHistoryLoss(line: string): void {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    const before = DeviceActivity.userDefaultsGet<string[]>(HISTORY_LOG_KEY);
    const kept = Array.isArray(before) ? before.filter((l) => typeof l === 'string') : [];
    DeviceActivity.userDefaultsSet(HISTORY_LOG_KEY, [...kept, `${timeOf(Date.now())}: ${line}`].slice(-6));
  } catch {
    // Only a record; never in the way.
  }
}

export function historyLog(): string[] {
  if (!SCREEN_TIME_AVAILABLE) return [];
  try {
    const value = DeviceActivity.userDefaultsGet<string[]>(HISTORY_LOG_KEY);
    return Array.isArray(value) ? value.filter((l) => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

/** The start of today's count, for keeping reports to today's. */
function dayStartOf(periodStart: Date): Date {
  return countStart(periodStart, countingSince());
}

const UNCOVER: Action[] = [{ type: 'disableBlockAllMode' }, { type: 'resetBlocks' }];
const STOP_EARNED_TIME: Action = { type: 'stopMonitoring', activityNames: [TOPUP_ACTIVITY] };

/** The last thing the phone refused, for the test build's readout. */
const PROBLEM_KEY = 'plainlimit_problem';
function note(where: string, error: unknown) {
  const at = new Date().toLocaleTimeString();
  try {
    DeviceActivity.userDefaultsSet(PROBLEM_KEY, `${where}, ${at}: ${error instanceof Error ? error.message : String(error)}`);
  } catch {
    // Nothing more to do; this is only for the readout.
  }
}

/** Only the apps that count are ever covered; whatever is left out of What counts stays open. */
function coverAction(shield: string): Action {
  return { type: 'blockSelection', familyActivitySelectionId: COUNTED_ID, shieldId: shield };
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
 */
function writeCheckpointActions(plan: ReturnType<typeof monitorPlan>, settings: Settings, now: Date) {
  const dayStart = dayStartOf(periodStartOf(now, settings.rechargeMinute));
  const sure = known();
  const held = holdUntil();
  const named = round();
  for (const event of plan.events) {
    const notBefore = new Date(Math.max(lockNotBefore(dayStart, sure, event.minutes).getTime(), held));
    DeviceActivity.configureActions({
      activityName: plan.activity,
      callbackName: 'eventDidReachThreshold',
      eventName: roundName(event.name, named),
      actions: event.actions.map((a) => ({ ...toAction(a), neverTriggerBefore: notBefore })),
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

const WRONG_SINCE_KEY = 'plainlimit_wrong_since';

/**
 * When counting was first seen not working, in the current run of checks with
 * no "fine" between them. Kept across launches, so a fault that lasts while
 * Plainlimit is closed is still caught on the next look.
 */
export function wrongSince(nowMs: number): number {
  if (!SCREEN_TIME_AVAILABLE) return nowMs;
  const at = readNumber(WRONG_SINCE_KEY);
  if (at > 0 && at <= nowMs) return at;
  try {
    DeviceActivity.userDefaultsSet(WRONG_SINCE_KEY, nowMs);
  } catch {
    // Only a record.
  }
  return nowMs;
}

/** Counting looked fine again: the run of bad checks is over. */
export function rightAgain(): void {
  if (!SCREEN_TIME_AVAILABLE || readNumber(WRONG_SINCE_KEY) === 0) return;
  try {
    DeviceActivity.userDefaultsRemove(WRONG_SINCE_KEY);
  } catch {
    // Only a record.
  }
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
    if (hold) DeviceActivity.userDefaultsSet(HOLD_KEY, now.getTime() + 2 * 3600 * 1000);
    else if (fresh) DeviceActivity.userDefaultsRemove(HOLD_KEY);
    DeviceActivity.userDefaultsSet(REGISTERED_KEY, now.getTime());
    // A different goal gives the same checkpoint names other minutes.
    const lastGoal = readNumber(REGISTERED_GOAL_KEY);
    if (!fresh && lastGoal > 0 && lastGoal !== settings.goalMinutes) startRound(now, lastGoal);
    DeviceActivity.userDefaultsSet(REGISTERED_GOAL_KEY, settings.goalMinutes);
    if (fresh) {
      // Counting starts (or starts over) now: forget earlier checkpoints and take every cover away.
      DeviceActivity.stopMonitoring([ACTIVITY, TICKS_ACTIVITY, TOPUP_ACTIVITY]);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TICKS_ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TOPUP_ACTIVITY}`);
      DeviceActivity.disableBlockAllMode('plainlimit');
      DeviceActivity.resetBlocks('plainlimit');
      DeviceActivity.userDefaultsSet(SINCE_KEY, now.getTime());
    }
    const since = countingSince();
    const plan = monitorPlan(settings, topUpsSoFar, since);
    const earlier = includesEarlierUse(periodStartOf(now, settings.rechargeMinute), since);
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);

    // There is no always-allowed list any more: what is not ticked never locks.
    DeviceActivity.clearWhitelist();

    writeCheckpointActions(plan, settings, now);
    // The screens come off when the day ends, a minute before the next one starts.
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'intervalDidEnd', actions: [...UNCOVER, STOP_EARNED_TIME] });

    const named = round();
    DeviceActivity.userDefaultsSet(WIDGET_PLAN_KEY, { ...plan.widget, round: named, roundBefore: readString(ROUND_BEFORE_KEY), picksChangedAt: picksChangedAt() });

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
    return miscounted(ownReports(), settings.goalMinutes, dayStartOf(periodStart), known()) ? 'miscounted' : 'fine';
  } catch {
    return 'fine';
  }
}

/** This round's reports for the day's checkpoints. */
function ownReports(): { id: string; name: string; at: Date }[] {
  const named = round();
  return DeviceActivity.getEvents(ACTIVITY)
    .filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName && splitName(e.eventName).round === named)
    .map((e) => ({ id: splitName(e.eventName as string).id, name: e.eventName as string, at: e.lastCalledAt }));
}

/**
 * After a miscount: forgets the reports that could not be true, so the phone
 * may make them again, and registers the day afresh. What was used since the
 * recharge still counts.
 */
export async function countAgain(settings: Settings, topUpsSoFar: number, periodStart: Date): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE) return false;
  try {
    const from = dayStartOf(periodStart);
    const sure = known();
    const own = new Map(checkpointsFor(settings.goalMinutes).map((c) => [c.id, c]));
    for (const report of ownReports()) {
      const checkpoint = own.get(report.id);
      if (checkpoint && report.at.getTime() >= from.getTime() && !believable(checkpoint, from, sure, report.at)) {
        DeviceActivity.userDefaultsRemove(`events_${ACTIVITY}_eventDidReachThreshold_${report.name}`);
      }
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
    DeviceActivity.userDefaultsRemove(WIDGET_PLAN_KEY);
    DeviceActivity.userDefaultsRemove(SINCE_KEY);
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
    const reported = [...DeviceActivity.getEvents(ACTIVITY), ...DeviceActivity.getEvents(TICKS_ACTIVITY)].filter(
      (e) => e.callbackName === 'eventDidReachThreshold' && e.eventName,
    );
    const from = dayStartOf(periodStart);
    const sure = known();
    // Only the current round's reports count (roundName). Just after the ticked
    // apps change, the old round's figure stands until the phone has
    // re-reported the day for the new list.
    const to = periodEnd?.getTime() ?? Number.POSITIVE_INFINITY;
    let goal = goalMinutes;
    let matches = (name: string, id: string) => name === roundName(id, round());
    // A finished day is closed from the round it ended in, read with today's
    // goal. (Matching any round read a 3:00 goal's "empty" as the 5:00 goal's.)
    if (periodEnd === undefined && !roundSettled(reported, from)) {
      const before = readString(ROUND_BEFORE_KEY);
      goal = readNumber(ROUND_GOAL_BEFORE_KEY) || goalMinutes;
      matches = (name, id) => name === roundName(id, before);
    }
    const arrived = [...checkpointsFor(goal), ...minuteTicksFor(goal)].filter((checkpoint) => {
      const report = reported.filter((e) => matches(e.eventName as string, checkpoint.id)).sort((a, b) => b.lastCalledAt.getTime() - a.lastCalledAt.getTime())[0];
      if (!report) return false;
      return report.lastCalledAt.getTime() < to && believable(checkpoint, from, sure, report.lastCalledAt);
    });
    return usedFloor(arrived);
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
    const sureNow = known();
    const notedNow = noted();
    lines.push(`Counting since: ${countingSince() ? timeOf(countingSince()) : 'the recharge'}`);
    const guarding = sureNow ? ` (guards reports until ${timeOf(sureNow.closes)})` : notedNow ? ' (not guarding: noted after the last registration)' : '';
    lines.push(`Known: ${notedNow ? `at most ${Math.round(notedNow.most)} min at ${timeOf(notedNow.at)}${guarding}` : 'nothing yet'}${holdUntil() > Date.now() ? ' (locks held for setup)' : ''}`);
    lines.push(`Registered at: ${timeOf(registeredAt())}`);
    lines.push(`Health: ${health(settings, periodStartOf(new Date(), settings.rechargeMinute), true)}`);
    lines.push(`Registered: ${DeviceActivity.getActivities().join(', ') || 'nothing'}`);
    const minutesOf = new Map(checkpointsFor(settings.goalMinutes).map((c) => [c.id as string, c]));
    const from = dayStartOf(periodStartOf(new Date(), settings.rechargeMinute));
    const reported = DeviceActivity.getEvents()
      .filter((e) => e.activityName === ACTIVITY || e.activityName === TOPUP_ACTIVITY)
      .map((e) => {
        const checkpoint = e.activityName === ACTIVITY && e.eventName ? minutesOf.get(splitName(e.eventName).id) : undefined;
        const early = checkpoint !== undefined && e.lastCalledAt.getTime() >= from.getTime() && !believable(checkpoint, from, sureNow, e.lastCalledAt);
        return `${e.eventName ?? e.callbackName}: ${timeOf(e.lastCalledAt.getTime())}${early ? ' (too early to be true, ignored)' : ''}`;
      });
    lines.push(reported.length ? `Reported by the phone:\n  ${reported.join('\n  ')}` : 'Reported by the phone: nothing yet');
    lines.push(`Monitor asked for a widget redraw: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_reload_asked'))}`);
    const cells = DeviceActivity.userDefaultsGet<number>('plainlimit_widget_cells');
    lines.push(`Widget last drew: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_widget_drew'))}${typeof cells === 'number' ? ` (${cells < 0 ? 'not set up' : `${cells} cells`})` : ''}`);
    lines.push(`Picked: ${pickCount(COUNTED_ID)} counted${picksChangedAt() > 0 ? `, last changed ${timeOf(picksChangedAt())} (round ${round() || 'first'})` : ''}`);
    // The library notes who last changed what is covered, and when.
    const last = DeviceActivity.userDefaultsGet<Record<string, unknown>>('lastBlockUpdate');
    if (last && typeof last === 'object') {
      const at = typeof last.blockedAt === 'string' ? timeOf(new Date(last.blockedAt).getTime()) : 'unknown';
      const what = last.blockingAllModeEnabled ? 'everything' : `${Number(last.blocklistCategoryCount ?? 0)} categories, ${Number(last.blocklistAppCount ?? 0)} apps`;
      lines.push(`Covers last changed: ${at} by ${String(last.triggeredBy ?? 'unknown')} (now covering ${what})`);
    } else {
      lines.push('Covers last changed: never');
    }
    lines.push(`Last problem: ${(DeviceActivity.userDefaultsGet(PROBLEM_KEY) as string | undefined) ?? 'none'}`);
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
 * Whether the phone has finished reporting the day for the current round
 * (picksSettled). Just after a change it hasn't, and the figure is still the
 * previous round's.
 */
function roundSettled(reported: { eventName?: string | null; lastCalledAt: Date }[], from: Date): boolean {
  const changed = picksChangedAt();
  if (changed < from.getTime()) return true;
  const named = round();
  const fresh = reported.filter((e) => e.eventName && splitName(e.eventName).round === named).map((e) => e.lastCalledAt.getTime());
  return picksSettled(Date.now(), changed, fresh.length > 0 ? Math.max(...fresh) : null);
}

/** For setup's last screen: whether the day's figure has settled after the latest change. */
export function countSettled(settings: Settings): boolean {
  if (!SCREEN_TIME_AVAILABLE) return true;
  try {
    const reported = [...DeviceActivity.getEvents(ACTIVITY), ...DeviceActivity.getEvents(TICKS_ACTIVITY)].filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName);
    return roundSettled(reported, dayStartOf(periodStartOf(new Date(), settings.rechargeMinute)));
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
    DeviceActivity.userDefaultsSet(HOLD_KEY, untilMs);
    writeCheckpointActions(monitorPlan(settings, topUpsSoFar, countingSince()), settings, new Date());
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');
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
    DeviceActivity.blockSelection({ activitySelectionId: COUNTED_ID }, 'plainlimit');
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
    DeviceActivity.userDefaultsRemove(HOLD_KEY);
    writeCheckpointActions(monitorPlan(settings, topUpsSoFar, countingSince()), settings, new Date());
    if (usedFloorNow >= settings.goalMinutes) coverEmptyNow(settings, topUpsSoFar);
  } catch (error) {
    note('starting', error);
  }
}

export { COUNTED_ID };
