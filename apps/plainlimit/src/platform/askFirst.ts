/**
 * The "Ask first" list on the phone (see src/domain/askFirst.ts for the rules).
 * Kept apart from the battery's counting: it only covers its own picks, shows
 * its own screen and runs its own timer. It never reads the phone's reports.
 */

import { Platform } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';
import type { Action, ShieldActions, ShieldConfiguration } from 'react-native-device-activity';

import {
  ASK_ID,
  ASK_IDLE,
  ASK_OPEN,
  ASK_USE,
  ASK_WATCH,
  IDLE_MINUTES,
  IDLE_SPAN_MINUTES,
  USE_CAP_MINUTES,
  askNotice,
  askShieldCopy,
  idleWindow,
  openChoice,
  openSpan,
  openUntil,
  tickOfUse,
  usedWindow,
  type AskFirst,
  type OpenChoice,
} from '@/domain/askFirst';
import { SHORTEST_WATCH_MINUTES, rgbOf, spanOf, topUpWindow } from '@/domain/monitorPlan';

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

/** Every timer the list runs after a sum. */
const OPEN_TIMERS = [ASK_OPEN, ASK_IDLE, ASK_USE];
/** What the phone does when an open stretch is over: cover the list again, and stop the stretch's timers. */
const COVER_AGAIN: Action[] = [
  { type: 'blockSelection', familyActivitySelectionId: ASK_ID },
  { type: 'stopMonitoring', activityNames: OPEN_TIMERS },
];

/**
 * When the list is open until, after a sum (0 when it isn't). Under "While I
 * use it" the phone covers the list again by itself once it has gone unused,
 * and stops the stretch's timers as it does: so there the list is only still
 * open while the phone still holds the timer.
 */
export function askOpenUntil(now = Date.now()): number {
  const until = readNumber('askOpenUntil');
  if (until <= now) return 0;
  if (readNumber('askOpenInUse') === 1 && AVAILABLE) {
    try {
      if (!DeviceActivity.getActivities().includes(ASK_OPEN)) return 0;
    } catch {
      // Taken as still open: the timer covers it again at the latest.
    }
  }
  return until;
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

function writeScreen(open: OpenChoice, battery: AskBattery) {
  const copy = askShieldCopy(open, battery.recharge, battery.empty);
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
      DeviceActivity.stopMonitoring([ASK_WATCH, ...OPEN_TIMERS]);
      DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
      DeviceActivity.userDefaultsRemove(LOOK_KEY);
      DeviceActivity.userDefaultsRemove(BUTTONS_KEY);
      forget('askOpenUntil');
      forget('askOpenInUse');
      return;
    }
    writeScreen(openChoice(askFirst as AskFirst), battery);
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
    DeviceActivity.stopMonitoring([ASK_WATCH, ...OPEN_TIMERS]);
    DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
    forget('askOpenUntil');
    forget('askOpenInUse');
  } catch {
    // Nothing more to do.
  }
}

/**
 * "While I use it" (askFirst.ts in the domain): has the phone cover the list
 * again once it has gone unused for `IDLE_MINUTES`, even with Plainlimit
 * closed. Two registrations:
 * - `ASK_IDLE`, a timer that starts `IDLE_MINUTES` from now. Its start covers
 *   the list (the phone reports a start the first time it is used after the
 *   start, so a phone left lying is covered as it is picked up again).
 * - `ASK_USE`, a checkpoint at every minute the list is used. Each one stops
 *   `ASK_IDLE` and starts it again `IDLE_MINUTES` on, from the phone's own
 *   extension. There are `USE_CAP_MINUTES` of them, and `ASK_OPEN` ends then
 *   too, so one sum never keeps the list open for longer than that.
 * If the phone refuses either, the list is not left open on a timer that
 * can't be put off: `false` and the caller opens it for the chosen minutes.
 */
async function coverWhenUnused(now: Date, until: Date): Promise<boolean> {
  try {
    const token = DeviceActivity.getFamilyActivitySelectionId(ASK_ID);
    if (!token) return false;
    const minute = 60_000;
    const putOff: Action[] = [
      { type: 'stopMonitoring', activityNames: [ASK_IDLE] },
      { type: 'startMonitoring', activityName: ASK_IDLE, deviceActivityEvents: [], intervalStartDelayMs: IDLE_MINUTES * minute, intervalEndDelayMs: (IDLE_MINUTES + IDLE_SPAN_MINUTES) * minute },
    ];
    const ticks = Array.from({ length: USE_CAP_MINUTES }, (_, i) => i + 1);
    for (const minutes of ticks) {
      DeviceActivity.configureActions({ activityName: ASK_USE, callbackName: 'eventDidReachThreshold', eventName: tickOfUse(minutes), actions: putOff });
    }
    DeviceActivity.userDefaultsClearWithPrefix(`events_${ASK_USE}`);
    DeviceActivity.userDefaultsClearWithPrefix(`events_${ASK_IDLE}`);
    DeviceActivity.configureActions({ activityName: ASK_IDLE, callbackName: 'intervalDidStart', actions: COVER_AGAIN });
    const idle = idleWindow(now);
    await DeviceActivity.startMonitoring(ASK_IDLE, { intervalStart: idle.start, intervalEnd: idle.end, repeats: false }, []);
    const used = usedWindow(now, until, SHORTEST_WATCH_MINUTES);
    await DeviceActivity.startMonitoring(
      ASK_USE,
      { intervalStart: used.start, intervalEnd: used.end, repeats: true },
      // Only use from here on counts, not what was used earlier in the stretch.
      ticks.map((minutes) => ({ eventName: tickOfUse(minutes), familyActivitySelection: token, threshold: spanOf(minutes), includesPastActivity: false })),
    );
    const held = DeviceActivity.getActivities();
    if (held.includes(ASK_IDLE) && held.includes(ASK_USE)) return true;
  } catch {
    // Falls through: opened for the chosen minutes instead.
  }
  try {
    DeviceActivity.stopMonitoring([ASK_IDLE, ASK_USE]);
  } catch {
    // Nothing more to do.
  }
  return false;
}

/** An open stretch: until when at the latest, and whether it is "While I use it" (covered again sooner, once the list goes unused). */
export interface AskOpen {
  until: Date;
  inUse: boolean;
}

/**
 * After the sum: uncovers the list and has the phone cover it again when the
 * open stretch ends, even if Plainlimit is closed by then. Returns the open
 * stretch, or null if the phone refused.
 */
export async function openAsk(askFirst: AskFirst, nextRechargeMs: number, now = new Date()): Promise<AskOpen | null> {
  if (!AVAILABLE) return { until: openUntil(now, openSpan(askFirst), nextRechargeMs), inUse: askFirst.whileInUse === true };
  try {
    DeviceActivity.stopMonitoring(OPEN_TIMERS);
    // "While I use it": the timers that cover it again once it goes unused. Without them it opens for the chosen minutes.
    const inUse = askFirst.whileInUse === true && (await coverWhenUnused(now, openUntil(now, USE_CAP_MINUTES, nextRechargeMs)));
    const until = openUntil(now, inUse ? USE_CAP_MINUTES : askFirst.openMinutes, nextRechargeMs);
    DeviceActivity.configureActions({ activityName: ASK_OPEN, callbackName: 'intervalDidEnd', actions: COVER_AGAIN });
    // The longer stretch of "While I use it" is given as one already running, like the shorter ones (which start in the past).
    const window = inUse ? usedWindow(now, until, SHORTEST_WATCH_MINUTES) : topUpWindow(until);
    await DeviceActivity.startMonitoring(ASK_OPEN, { intervalStart: window.start, intervalEnd: window.end, repeats: true }, []);
    // Only uncovered once the phone holds the timer that covers it again.
    if (!DeviceActivity.getActivities().includes(ASK_OPEN)) {
      DeviceActivity.stopMonitoring(OPEN_TIMERS);
      return null;
    }
    save('askOpenUntil', until.getTime());
    save('askOpenInUse', inUse ? 1 : 0);
    DeviceActivity.unblockSelection(SELECTION, 'plainlimit-ask');
    return { until, inUse };
  } catch {
    try {
      // Nothing is left running for a list that stayed covered.
      DeviceActivity.stopMonitoring(OPEN_TIMERS);
    } catch {
      // Nothing more to do.
    }
    return null;
  }
}
