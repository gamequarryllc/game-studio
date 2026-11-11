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
  TOPUP_EVENT,
  WIDGET_PLAN_KEY,
  countStart,
  includesEarlierUse,
  monitorPlan,
  puzzleNotice,
  spanOf,
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

const widgets = Platform.OS === 'ios' ? requireOptionalNativeModule<{ reload(): void }>('PlainlimitWidgets') : null;

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

function writeShield(shield: PlanShield, topUpsSoFar: number) {
  const look: ShieldConfiguration = {
    title: shield.copy.title,
    subtitle: shield.copy.line,
    primaryButtonLabel: shield.copy.primary,
    backgroundColor: shield.background,
    titleColor: shield.ink,
    subtitleColor: shield.ink,
    iconSystemName: shield.icon,
    iconTint: shield.ink,
    primaryButtonBackgroundColor: shield.ink,
    primaryButtonLabelColor: shield.background,
    secondaryButtonLabelColor: shield.ink,
  };
  if (shield.copy.secondary && shield.secondary) look.secondaryButtonLabel = shield.copy.secondary;
  const buttons: ShieldActions = { primary: buttonAction(shield.primary, topUpsSoFar) };
  if (shield.copy.secondary && shield.secondary) buttons.secondary = buttonAction(shield.secondary, topUpsSoFar);
  DeviceActivity.updateShieldWithId(look, buttons, shield.id);
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
    DeviceActivity.configureActions({ activityName: plan.activity, callbackName: 'intervalDidEnd', actions: UNCOVER });

    DeviceActivity.userDefaultsSet(WIDGET_PLAN_KEY, plan.widget);

    const token = countedToken(settings);
    await DeviceActivity.startMonitoring(
      plan.activity,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.events.map((event) => ({ eventName: event.name, familyActivitySelection: token, threshold: event.after, includesPastActivity: earlier })),
    );
    reloadWidget();
    return true;
  } catch {
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

/** Calls back whenever the phone reports a checkpoint while the app is open. */
export function onCheckpoint(listener: () => void): () => void {
  if (!SCREEN_TIME_AVAILABLE) return () => {};
  const subscription = DeviceActivity.onDeviceActivityMonitorEvent(() => listener());
  return () => subscription.remove();
}

/**
 * The sums were solved: uncover the apps, and ask the phone to cover them
 * again after this many more minutes of use. Close to the recharge time the
 * phone cannot schedule that (it needs at least a quarter of an hour), so the
 * apps simply stay open until the battery is full again.
 */
export async function grantExtraTime(minutes: number, settings: Settings, topUpsAfter: number, now: Date): Promise<void> {
  if (!SCREEN_TIME_AVAILABLE || permission() !== 'approved') return;
  try {
    DeviceActivity.disableBlockAllMode('plainlimit');
    DeviceActivity.resetBlocks('plainlimit');

    const plan = monitorPlan(settings, topUpsAfter, countingSince());
    const empty = plan.shields.find((s) => s.id === 'empty');
    if (empty) writeShield(empty, topUpsAfter);

    const end = new Date(nextRecharge(now, settings.rechargeMinute).getTime() - 60_000);
    if (end.getTime() - now.getTime() < 16 * 60_000) return;

    DeviceActivity.configureActions({
      activityName: TOPUP_ACTIVITY,
      callbackName: 'eventDidReachThreshold',
      eventName: TOPUP_EVENT,
      actions: [coverAction('empty', plan.coverEverything)],
    });
    await DeviceActivity.startMonitoring(
      TOPUP_ACTIVITY,
      { intervalStart: { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() }, intervalEnd: { hour: end.getHours(), minute: end.getMinutes() }, repeats: false },
      [{ eventName: TOPUP_EVENT, familyActivitySelection: countedToken(settings), threshold: spanOf(minutes) }],
    );
  } catch {
    // The apps are uncovered; the worst case is that they stay so until the recharge.
  }
}

export { ALLOWED_ID, COUNTED_ID };
