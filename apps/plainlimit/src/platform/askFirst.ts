/**
 * The "Ask first" list on the phone (see src/domain/askFirst.ts for the rules).
 * Kept apart from the battery's counting: it only covers its own picks, shows
 * its own screen and runs its own timer. It never reads the phone's reports.
 */

import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import { ASK_ID, ASK_OPEN, ASK_WATCH, askNotice, askShieldCopy, openUntil, type AskFirst } from '@/domain/askFirst';
import { rgbOf, topUpWindow } from '@/domain/monitorPlan';

import { forget, readNumber, save } from './saved';

const AVAILABLE = Platform.OS === 'ios' && DeviceActivity.isAvailable();
const SELECTION = { activitySelectionId: ASK_ID };

/** Where the library looks for the screen and buttons of an app on a given list. */
const LOOK_KEY = `shieldConfigurationForSelection_${ASK_ID}`;
const BUTTONS_KEY = `shieldActionsForSelection_${ASK_ID}`;

function picked(): number {
  if (!AVAILABLE) return 0;
  try {
    const meta = DeviceActivity.activitySelectionMetadata(SELECTION);
    // The native side spells it webdomainCount, the type webDomainCount (see screenTime.ts, sitesIn).
    const sites = (meta as { webDomainCount?: number; webdomainCount?: number } | null)?.webDomainCount ?? (meta as { webdomainCount?: number } | null)?.webdomainCount ?? 0;
    return meta ? meta.applicationCount + meta.categoryCount + sites : 0;
  } catch {
    return 0;
  }
}

/** On, with something picked. */
export function askActive(askFirst: AskFirst | undefined): boolean {
  return askFirst?.on === true && picked() > 0;
}

/** When the list is open until, after a sum (0 when it isn't). */
export function askOpenUntil(now = Date.now()): number {
  const until = readNumber('askOpenUntil');
  return until > now ? until : 0;
}

/** For the phone to run when it takes every cover off at the recharge: put this list's cover back. */
export function askCoverActions(askFirst: AskFirst | undefined): Action[] {
  return askActive(askFirst) ? [{ type: 'blockSelection', familyActivitySelectionId: ASK_ID }] : [];
}

/** Covers the list again right away, unless it is open after a sum. Called after the app takes every cover off. */
export function coverAskAgain(askFirst: AskFirst | undefined): void {
  if (!AVAILABLE || !askActive(askFirst) || askOpenUntil() > 0) return;
  try {
    DeviceActivity.blockSelection(SELECTION, 'plainlimit-ask');
  } catch {
    // Put back the next time the app comes to the front.
  }
}

function writeScreen(openMinutes: number, battery: AskBattery) {
  const copy = askShieldCopy(openMinutes, battery.recharge, battery.empty);
  const notice = askNotice();
  const look: ShieldConfiguration = {
    title: copy.title,
    subtitle: copy.line,
    primaryButtonLabel: copy.primary,
    secondaryButtonLabel: copy.secondary,
    backgroundColor: rgbOf('#15181A'),
    backgroundBlurStyle: DeviceActivity.UIBlurEffectStyle.systemMaterialDark,
    titleColor: rgbOf('#F4F5F2'),
    subtitleColor: rgbOf('#D6D9DC'),
    iconSystemName: 'hand.raised',
    iconTint: rgbOf('#F4F5F2'),
    primaryButtonBackgroundColor: rgbOf('#F4F5F2'),
    primaryButtonLabelColor: rgbOf('#10120F'),
    secondaryButtonLabelColor: rgbOf('#F4F5F2'),
  };
  const buttons: ShieldActions = {
    primary: { behavior: 'close', actions: [] },
    secondary: {
      behavior: 'close',
      actions: [{ type: 'sendNotification', payload: { title: notice.title, body: notice.body, sound: 'default', interruptionLevel: 'active', userInfo: { route: notice.route } } }],
    },
  };
  DeviceActivity.userDefaultsSet(LOOK_KEY, look);
  DeviceActivity.userDefaultsSet(BUTTONS_KEY, buttons);
}

/** What the list's screen needs to know about the battery (askShieldCopy). */
export interface AskBattery {
  empty: boolean;
  /** The recharge time, "6:00 AM". */
  recharge: string;
}

/**
 * Puts the list's screen and cover in place, or takes them away when the list
 * is off or empty. Safe to repeat. Taking the cover away also uncovers an app
 * on both lists, so the caller covers the battery's apps again if it is empty.
 */
export async function applyAskFirst(askFirst: AskFirst | undefined, battery: AskBattery): Promise<void> {
  if (!AVAILABLE) return;
  try {
    if (!askActive(askFirst)) {
      DeviceActivity.stopMonitoring([ASK_WATCH, ASK_OPEN]);
      DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
      DeviceActivity.userDefaultsRemove(LOOK_KEY);
      DeviceActivity.userDefaultsRemove(BUTTONS_KEY);
      forget('askOpenUntil');
      return;
    }
    writeScreen((askFirst as AskFirst).openMinutes, battery);
    // The phone shows a list's own screen only while an activity named for it runs.
    if (!DeviceActivity.getActivities().includes(ASK_WATCH)) {
      await DeviceActivity.startMonitoring(ASK_WATCH, { intervalStart: { hour: 0, minute: 0 }, intervalEnd: { hour: 23, minute: 59 }, repeats: true }, []);
    }
    if (askOpenUntil() === 0) DeviceActivity.blockSelection(SELECTION, 'plainlimit-ask');
  } catch {
    // Tried again the next time the app comes to the front.
  }
}

/** Stops the list altogether (counting turned off). */
export function stopAskFirst(): void {
  if (!AVAILABLE) return;
  try {
    DeviceActivity.stopMonitoring([ASK_WATCH, ASK_OPEN]);
    DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
    forget('askOpenUntil');
  } catch {
    // Nothing more to do.
  }
}

/**
 * After the sum: uncovers the list and has the phone cover it again when the
 * open stretch ends, even if Plainlimit is closed by then. Returns when it is
 * open until, or null if the phone refused.
 */
export async function openAsk(askFirst: AskFirst, nextRechargeMs: number, now = new Date()): Promise<Date | null> {
  if (!AVAILABLE) return openUntil(now, askFirst.openMinutes, nextRechargeMs);
  try {
    const until = openUntil(now, askFirst.openMinutes, nextRechargeMs);
    DeviceActivity.stopMonitoring([ASK_OPEN]);
    DeviceActivity.configureActions({
      activityName: ASK_OPEN,
      callbackName: 'intervalDidEnd',
      actions: [{ type: 'blockSelection', familyActivitySelectionId: ASK_ID }, { type: 'stopMonitoring', activityNames: [ASK_OPEN] }],
    });
    const window = topUpWindow(until);
    await DeviceActivity.startMonitoring(ASK_OPEN, { intervalStart: window.start, intervalEnd: window.end, repeats: true }, []);
    // Only uncovered once the phone holds the timer that covers it again.
    if (!DeviceActivity.getActivities().includes(ASK_OPEN)) return null;
    save('askOpenUntil', until.getTime());
    DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
    return until;
  } catch {
    return null;
  }
}
