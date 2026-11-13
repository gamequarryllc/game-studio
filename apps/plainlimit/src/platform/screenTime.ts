import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldAction, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { checkpointsFor, isPlausible, usedFloor } from '@/domain/checkpoints';
import { nextRecharge, periodStart as periodStartOf } from '@/domain/day';
import {
  ACTIVITY,
  ALLOWED_ID,
  COUNTED_ID,
  TOPUP_ACTIVITY,
  WIDGET_PLAN_KEY,
  countStart,
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
// None of this has been tried on a real iPhone yet. NOTES.md lists what to check.

/** True only in a build that carries the Screen Time pieces. */
export const SCREEN_TIME_AVAILABLE = Platform.OS === 'ios' && DeviceActivity.isAvailable();

/**
 * Developer tools (pretend use, screen previews) show in dev builds, on the
 * web preview and in a "playtest" build for TestFlight, which the iPhone build
 * makes by setting EXPO_PUBLIC_PLAYTEST=1. They are never in a store build.
 */
export const DEV_TOOLS = __DEV__ || Platform.OS === 'web' || process.env.EXPO_PUBLIC_PLAYTEST === '1';

export type Permission = 'unknown' | 'denied' | 'approved';

const widgets = Platform.OS === 'ios' ? requireOptionalNativeModule<{ reload(): void; build?(): string }>('PlainlimitWidgets') : null;

/** Asks iOS to redraw the home screen widget now. */
export function reloadWidget() {
  try {
    widgets?.reload();
  } catch {
    // The widget catches up on its own within the hour.
  }
}

export function permission(): Permission {
  if (!SCREEN_TIME_AVAILABLE) return 'unknown';
  const status = DeviceActivity.getAuthorizationStatus();
  if (status === DeviceActivity.AuthorizationStatus.approved) return 'approved';
  if (status === DeviceActivity.AuthorizationStatus.denied) return 'denied';
  return 'unknown';
}

/** Shows Apple's "allow Screen Time access" sheet. */
export async function askPermission(): Promise<Permission> {
  if (!SCREEN_TIME_AVAILABLE) return 'unknown';
  try {
    await DeviceActivity.requestAuthorization('individual');
  } catch {
    // Declined, or Screen Time is switched off on this phone.
  }
  return permission();
}

/** Whether the day's monitoring is registered with the phone. */
export function isOn(): boolean {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return false;
  try {
    return DeviceActivity.getActivities().includes(ACTIVITY);
  } catch {
    return false;
  }
}

/** How many apps, categories and sites are in one of the person's picks. The app never learns which. */
export function pickCount(id: typeof COUNTED_ID | typeof ALLOWED_ID): number {
  if (!SCREEN_TIME_AVAILABLE) return 0;
  try {
    const meta = DeviceActivity.activitySelectionMetadata({ activitySelectionId: id });
    return (meta?.applicationCount ?? 0) + (meta?.categoryCount ?? 0) + (meta?.webDomainCount ?? 0);
  } catch {
    return 0;
  }
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

function coverAction(shield: string, coverEverything: boolean): Action {
  return coverEverything ? { type: 'enableBlockAllMode', shieldId: shield } : { type: 'blockSelection', familyActivitySelectionId: COUNTED_ID, shieldId: shield };
}

function toAction(action: PlanAction, coverEverything: boolean): Action {
  if (action.kind === 'cover') return coverAction(action.shield, coverEverything);
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
 * Writes the covering screens' look and words again, and nothing else. Called
 * when the app starts, so that an update which changes how the screens look
 * reaches the phone without the day having to be registered again (which on a
 * first day would restart the count).
 */
export function refreshScreens(settings: Settings, topUpsSoFar: number) {
  if (!SCREEN_TIME_AVAILABLE || !isOn()) return;
  try {
    for (const shield of monitorPlan(settings, topUpsSoFar, countingSince()).shields) writeShield(shield, topUpsSoFar);
  } catch (error) {
    note('the screens', error);
  }
}

/**
 * The token for what counts. An empty one means "all use of the phone": the
 * phone is asked about every app, and the always-allowed ones are only spared
 * from being covered, not from counting.
 */
function countedToken(settings: Settings): string {
  if (settings.countMode === 'everything') return '';
  return DeviceActivity.getFamilyActivitySelectionId(COUNTED_ID) ?? '';
}

/**
 * Registers the day with the phone: the checkpoints, the screens, the buttons,
 * and what the widget needs. Safe to call again whenever a setting changes;
 * the phone keeps today's count.
 */
export async function applyPlan(settings: Settings, topUpsSoFar: number, fresh = false): Promise<boolean> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return false;
  try {
    const now = new Date();
    if (fresh) {
      // Counting starts (or starts over) now: forget earlier checkpoints and take every cover away.
      DeviceActivity.stopMonitoring([ACTIVITY, TOPUP_ACTIVITY]);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${ACTIVITY}`);
      DeviceActivity.userDefaultsClearWithPrefix(`events_${TOPUP_ACTIVITY}`);
      DeviceActivity.disableBlockAllMode('plainlimit');
      DeviceActivity.resetBlocks('plainlimit');
      DeviceActivity.userDefaultsSet(SINCE_KEY, now.getTime());
    }
    const since = countingSince();
    const plan = monitorPlan(settings, topUpsSoFar, since);
    const earlier = includesEarlierUse(periodStartOf(now, settings.rechargeMinute), since);
    for (const shield of plan.shields) writeShield(shield, topUpsSoFar);

    DeviceActivity.clearWhitelist();
    if (pickCount(ALLOWED_ID) > 0) DeviceActivity.addSelectionToWhitelistAndUpdateBlock({ activitySelectionId: ALLOWED_ID }, 'plainlimit');

    for (const event of plan.events) {
      DeviceActivity.configureActions({
        activityName: plan.activity,
        callbackName: 'eventDidReachThreshold',
        eventName: event.name,
        actions: event.actions.map((a) => toAction(a, plan.coverEverything)),
      });
    }
    // The screens come off when the day ends, a minute before the next one starts.
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'intervalDidEnd', actions: [...UNCOVER, STOP_EARNED_TIME] });

    DeviceActivity.userDefaultsSet(WIDGET_PLAN_KEY, plan.widget);

    const token = countedToken(settings);
    await DeviceActivity.startMonitoring(
      plan.activity,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.events.map((event) => ({ eventName: event.name, familyActivitySelection: token, threshold: event.after, includesPastActivity: earlier })),
    );
    reloadWidget();
    return true;
  } catch (error) {
    note('the day', error);
    return false;
  }
}

/** Stops counting and takes any covering screen away. */
export function turnOff() {
  if (!SCREEN_TIME_AVAILABLE) return;
  try {
    DeviceActivity.stopMonitoring([ACTIVITY, TOPUP_ACTIVITY]);
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
export function usedSoFar(goalMinutes: number, periodStart: Date): number | null {
  if (!SCREEN_TIME_AVAILABLE) return null;
  try {
    const reported = DeviceActivity.getEvents(ACTIVITY).filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName);
    const from = countStart(periodStart, countingSince());
    const arrived = checkpointsFor(goalMinutes).filter((checkpoint) => {
      const report = reported.find((e) => e.eventName === checkpoint.id);
      return report !== undefined && report.lastCalledAt.getTime() >= from.getTime() && isPlausible(checkpoint, from, report.lastCalledAt);
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
export function diagnostics(): string[] {
  if (!SCREEN_TIME_AVAILABLE) return [];
  try {
    const lines: string[] = [];
    // So a screenshot shows how old the lines below are.
    lines.push(`Build: ${widgets?.build?.() ?? 'unknown'}. Read at: ${timeOf(Date.now())}`);
    lines.push(`Counting since: ${timeOf(countingSince())}`);
    lines.push(`Registered: ${DeviceActivity.getActivities().join(', ') || 'nothing'}`);
    const reported = DeviceActivity.getEvents()
      .filter((e) => e.activityName === ACTIVITY || e.activityName === TOPUP_ACTIVITY)
      .map((e) => `${e.eventName ?? e.callbackName}: ${timeOf(e.lastCalledAt.getTime())}`);
    lines.push(reported.length ? `Reported by the phone:\n  ${reported.join('\n  ')}` : 'Reported by the phone: nothing yet');
    lines.push(`Monitor asked for a widget redraw: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_reload_asked'))}`);
    const cells = DeviceActivity.userDefaultsGet<number>('plainlimit_widget_cells');
    lines.push(`Widget last drew: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_widget_drew'))}${typeof cells === 'number' ? ` (${cells < 0 ? 'not set up' : `${cells} cells`})` : ''}`);
    lines.push(`Picked: ${pickCount(COUNTED_ID)} counted, ${pickCount(ALLOWED_ID)} always allowed`);
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
export function reportWindow(settings: Settings, now: Date): { fromMs: number; toMs: number; selection: string | null } {
  const from = countStart(periodStartOf(now, settings.rechargeMinute), countingSince());
  const token = SCREEN_TIME_AVAILABLE && settings.countMode !== 'everything' ? (DeviceActivity.getFamilyActivitySelectionId(COUNTED_ID) ?? null) : null;
  return { fromMs: from.getTime(), toMs: nextRecharge(now, settings.rechargeMinute).getTime(), selection: token };
}

/** Calls back whenever the phone reports a checkpoint while the app is open. */
export function onCheckpoint(listener: () => void): () => void {
  if (!SCREEN_TIME_AVAILABLE) return () => {};
  const subscription = DeviceActivity.onDeviceActivityMonitorEvent(() => listener());
  return () => subscription.remove();
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

    DeviceActivity.configureActions({ activityName: TOPUP_ACTIVITY, callbackName: 'intervalDidEnd', actions: [coverAction('empty', plan.coverEverything), STOP_EARNED_TIME] });
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
    if (plan.coverEverything) DeviceActivity.enableBlockAllMode('plainlimit');
    else DeviceActivity.blockSelection({ activitySelectionId: COUNTED_ID }, 'plainlimit');
  } catch {
    // Nothing more to do.
  }
}

export { ALLOWED_ID, COUNTED_ID };
