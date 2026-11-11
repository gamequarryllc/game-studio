import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// The app's notifications are all made on the phone itself: "nearly out", and
// the one that carries someone from the empty screen to the sums. Nothing is
// ever sent from a server.

/** The only places a notification may open. */
const ROUTES = ['/puzzle'] as const;
export type NoticeRoute = (typeof ROUTES)[number];

function routeOf(data: unknown): NoticeRoute | null {
  const route = data && typeof data === 'object' ? (data as Record<string, unknown>).route : null;
  return typeof route === 'string' && (ROUTES as readonly string[]).includes(route) ? (route as NoticeRoute) : null;
}

if (Platform.OS === 'ios') {
  // Show them even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Asks once whether the app may show notifications. */
export async function askToNotify(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  } catch {
    // Without them the empty screen's "I need more time" has nowhere to lead; Settings says so.
  }
}

/** Calls back with the page a tapped notification asks for, including the one that opened the app. */
export function onNoticeRoute(go: (route: NoticeRoute) => void): () => void {
  if (Platform.OS !== 'ios') return () => {};
  let stopped = false;
  void Notifications.getLastNotificationResponseAsync()
    .then((last) => {
      const route = last ? routeOf(last.notification.request.content.data) : null;
      if (route && !stopped) go(route);
    })
    .catch(() => {});
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeOf(response.notification.request.content.data);
    if (route) go(route);
  });
  return () => {
    stopped = true;
    subscription.remove();
  };
}
