import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

import type { Planned } from '@/domain/reminders';

// Reminders on the iPhone: local notifications the phone itself delivers.
// Nothing is sent anywhere; there is no push service and no server.
// The web preview has a stand-in that delivers nothing: notify.web.ts.

/** True where reminders really arrive; false on the web preview. */
export const DELIVERS = true;

export type Permission = 'granted' | 'denied' | 'undetermined';

export interface OpenTarget {
  jobId: string | null;
  thingId: string | null;
}

// A reminder that fires while the app is open still shows: it is why the app is there.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function read(status: Notifications.NotificationPermissionsStatus): Permission {
  // 3 is "provisional": the iPhone delivers quietly until the person decides.
  if (status.granted || (status.ios?.status as number | undefined) === 3) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function permission(): Promise<Permission> {
  try {
    return read(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/** Shows the iPhone's own question, once. After a "no" only the Settings app can change it. */
export async function askPermission(): Promise<Permission> {
  try {
    return read(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    return 'denied';
  }
}

export function openSystemSettings(): void {
  void Linking.openSettings().catch(() => {});
}

let applied: string | null = null;
let queue: Promise<void> = Promise.resolve();

/** Makes the phone's waiting reminders match the plan. The same plan twice does nothing the second time. */
export function applyPlan(plan: Planned[]): Promise<void> {
  const signature = JSON.stringify(plan.map((p) => [p.key, p.fireAt, p.title, p.body]));
  queue = queue
    .then(async () => {
      if (signature === applied) return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const p of plan) {
        await Notifications.scheduleNotificationAsync({
          identifier: p.key,
          content: { title: p.title, body: p.body, sound: 'default', data: { jobId: p.jobId, thingId: p.thingId } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
        });
      }
      applied = signature;
    })
    .catch(() => {
      // Scheduling failed part-way: forget what was applied so the next change tries again from clean.
      applied = null;
    });
  return queue;
}

function targetOf(response: Notifications.NotificationResponse | null): OpenTarget | null {
  const data = response?.notification.request.content.data as { jobId?: unknown; thingId?: unknown } | undefined;
  if (!response || !data) return null;
  return { jobId: typeof data.jobId === 'string' ? data.jobId : null, thingId: typeof data.thingId === 'string' ? data.thingId : null };
}

/** Calls back when a reminder is tapped, including the one that opened the app. */
export function onReminderOpened(handler: (target: OpenTarget) => void): () => void {
  try {
    const first = targetOf(Notifications.getLastNotificationResponse());
    if (first) {
      Notifications.clearLastNotificationResponse();
      handler(first);
    }
  } catch {
    // Nothing opened the app.
  }
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const target = targetOf(response);
    if (target) handler(target);
  });
  return () => sub.remove();
}
