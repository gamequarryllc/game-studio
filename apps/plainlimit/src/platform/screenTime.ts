import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldAction, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { believable, checkpointsFor, guardFrom, minuteTicksFor, miscounted, mostByNow, usedFloor, type Known } from '@/domain/checkpoints';
import { nextRecharge, periodStart as periodStartOf } from '@/domain/day';
import {
  ACTIVITY,
  COUNTED_ID,
  TICKS_ACTIVITY,
  TOPUP_ACTIVITY,
  WIDGET_PLAN_KEY,
  countStart,
  earliestTrue,
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
export function pickCount(id: typeof COUNTED_ID): number {
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

/** Where the last known figure is kept (see `Known` and `mostByNow`). */
const KNOWN_KEY = 'plainlimit_known';

function known(): Known | null {
  try {
    const value = DeviceActivity.userDefaultsGet<Known>(KNOWN_KEY);
    return value && typeof value.at === 'number' && typeof value.most === 'number' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Notes, while counting works, the most that can have been used by now (see
 * `mostByNow`). Nothing is noted once the goal is passed.
 */
export function noteKnown(settings: Settings, usedFloorNow: number, now = new Date()) {
  if (!SCREEN_TIME_AVAILABLE) return;
  // Right after counting is set up the phone is still sending reports for time
  // already used, so "not reported yet" does not yet mean "not reached yet".
  if (now.getTime() - registeredAt() < SETTLE_MS) return;
  const most = mostByNow(settings.goalMinutes, usedFloorNow);
  if (most === null) return;
  try {
    DeviceActivity.userDefaultsSet(KNOWN_KEY, { at: now.getTime(), most } satisfies Known);
  } catch {
    // Without it the guard falls back to the time since the recharge.
  }
}

/** When the day was last registered with the phone, and how long its first reports take to arrive. */
const REGISTERED_KEY = 'plainlimit_registered_at';
const SETTLE_MS = 3 * 60 * 1000;

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
 * checkpoint can be true (see `earliestTrue` and `guardFrom`), nor while setup
 * holds the locks. This only writes settings; it registers nothing, so it is
 * safe to repeat.
 */
function writeCheckpointActions(plan: ReturnType<typeof monitorPlan>, settings: Settings, now: Date) {
  const from = guardFrom(dayStartOf(periodStartOf(now, settings.rechargeMinute)), known());
  const held = holdUntil();
  for (const event of plan.events) {
    const notBefore = new Date(Math.max(earliestTrue(from, event.minutes).getTime(), held));
    DeviceActivity.configureActions({
      activityName: plan.activity,
      callbackName: 'eventDidReachThreshold',
      eventName: event.name,
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
export async function applyPlan(settings: Settings, topUpsSoFar: number, fresh = false, hold = false): Promise<boolean> {
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

    DeviceActivity.userDefaultsSet(WIDGET_PLAN_KEY, plan.widget);

    await DeviceActivity.startMonitoring(
      plan.activity,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.events.map((event) => ({ eventName: event.name, familyActivitySelection: token, threshold: event.after, includesPastActivity: earlier })),
    );
    await registerTicks(plan, token, earlier);
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
async function registerTicks(plan: ReturnType<typeof monitorPlan>, token: string, earlier: boolean) {
  try {
    if (plan.ticks.length === 0) {
      DeviceActivity.stopMonitoring([TICKS_ACTIVITY]);
      return;
    }
    await DeviceActivity.startMonitoring(
      TICKS_ACTIVITY,
      { intervalStart: plan.start, intervalEnd: plan.end, repeats: true },
      plan.ticks.map((tick) => ({ eventName: tick.name, familyActivitySelection: token, threshold: tick.after, includesPastActivity: earlier })),
    );
  } catch (error) {
    note('the minute checkpoints', error);
  }
}

/** How the day's counting stands. Only ever not 'fine' when counting is meant to be on. */
export type Health = 'fine' | 'nothingPicked' | 'accessOff' | 'notRegistered' | 'miscounted';

/**
 * Whether the day is really being counted. `watching` is whether the person
 * has counting turned on; turning it off on purpose is not a fault.
 * - nothingPicked: nothing is ticked in What counts, so nothing can count.
 * - accessOff: Screen Time access has been taken away in the Settings app.
 * - notRegistered: the phone has forgotten the day's monitoring.
 * - miscounted: the phone reported a checkpoint too soon to be true (see `miscounted`).
 */
export function health(settings: Settings, periodStart: Date, watching: boolean): Health {
  if (!SCREEN_TIME_AVAILABLE || !watching) return 'fine';
  if (permission() !== 'approved') return 'accessOff';
  try {
    if (pickCount(COUNTED_ID) === 0) return 'nothingPicked';
    if (!DeviceActivity.getActivities().includes(ACTIVITY)) return 'notRegistered';
    return miscounted(ownReports(), settings.goalMinutes, dayStartOf(periodStart), known()) ? 'miscounted' : 'fine';
  } catch {
    return 'fine';
  }
}

function ownReports(): { id: string; at: Date }[] {
  return DeviceActivity.getEvents(ACTIVITY)
    .filter((e) => e.callbackName === 'eventDidReachThreshold' && e.eventName)
    .map((e) => ({ id: e.eventName as string, at: e.lastCalledAt }));
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
        DeviceActivity.userDefaultsRemove(`events_${ACTIVITY}_eventDidReachThreshold_${report.id}`);
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
    const to = periodEnd?.getTime() ?? Number.POSITIVE_INFINITY;
    const arrived = [...checkpointsFor(goalMinutes), ...minuteTicksFor(goalMinutes)].filter((checkpoint) => {
      const report = reported.find((e) => e.eventName === checkpoint.id);
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
    lines.push(`Counting since: ${countingSince() ? timeOf(countingSince()) : 'the recharge'}`);
    lines.push(`Known: ${sureNow ? `at most ${Math.round(sureNow.most)} min at ${timeOf(sureNow.at)}` : 'nothing yet'}${holdUntil() > Date.now() ? ' (locks held for setup)' : ''}`);
    lines.push(`Health: ${health(settings, periodStartOf(new Date(), settings.rechargeMinute), true)}`);
    lines.push(`Registered: ${DeviceActivity.getActivities().join(', ') || 'nothing'}`);
    const minutesOf = new Map(checkpointsFor(settings.goalMinutes).map((c) => [c.id as string, c]));
    const from = dayStartOf(periodStartOf(new Date(), settings.rechargeMinute));
    const reported = DeviceActivity.getEvents()
      .filter((e) => e.activityName === ACTIVITY || e.activityName === TOPUP_ACTIVITY)
      .map((e) => {
        const checkpoint = e.activityName === ACTIVITY && e.eventName ? minutesOf.get(e.eventName) : undefined;
        const early = checkpoint !== undefined && e.lastCalledAt.getTime() >= from.getTime() && !believable(checkpoint, from, sureNow, e.lastCalledAt);
        return `${e.eventName ?? e.callbackName}: ${timeOf(e.lastCalledAt.getTime())}${early ? ' (too early to be true, ignored)' : ''}`;
      });
    lines.push(reported.length ? `Reported by the phone:\n  ${reported.join('\n  ')}` : 'Reported by the phone: nothing yet');
    lines.push(`Monitor asked for a widget redraw: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_reload_asked'))}`);
    const cells = DeviceActivity.userDefaultsGet<number>('plainlimit_widget_cells');
    lines.push(`Widget last drew: ${timeOf(DeviceActivity.userDefaultsGet<number>('plainlimit_widget_drew'))}${typeof cells === 'number' ? ` (${cells < 0 ? 'not set up' : `${cells} cells`})` : ''}`);
    lines.push(`Picked: ${pickCount(COUNTED_ID)} counted`);
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
