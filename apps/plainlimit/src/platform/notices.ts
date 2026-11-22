import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// The app's notifications are all made on the phone itself: "nearly out", and
// the one that carries someone from the empty screen to the sums. Nothing is
// ever sent from a server.

/** The only places a notification may open. */
const ROUTES = ['/puzzle', '/ask'] as const;
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

/** Whether the app may show notifications: allowed, turned down, or not asked yet. */
export type NotifyAnswer = 'on' | 'off' | 'unasked';

/** The iPhone's own answers (UNAuthorizationStatus, which expo-notifications passes on as `ios.status`): 0 not asked, 1 denied, 2 allowed, 3 and 4 allowed quietly or for a while. */
const IOS_NOT_ASKED = 0;
const IOS_ALLOWED_FROM = 2;

export function answerOf(status: Pick<Notifications.NotificationPermissionsStatus, 'granted' | 'status' | 'ios'>): NotifyAnswer {
  const ios = status.ios?.status as number | undefined;
  if (status.granted || (ios !== undefined && ios >= IOS_ALLOWED_FROM)) return 'on';
  if (ios === IOS_NOT_ASKED || (ios === undefined && status.status === 'undetermined')) return 'unasked';
  return 'off';
}

/** Off an iPhone there is nothing to ask; the preview plays along, so setup's screen can be walked through. */
let pretend: NotifyAnswer = 'unasked';

/** Whether notifications are allowed, without asking. */
export async function notifyState(): Promise<NotifyAnswer> {
  if (Platform.OS !== 'ios') return pretend;
  try {
    return answerOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'unasked';
  }
}

/** Asks whether the app may show notifications. The iPhone puts the question only once; after that this just reports the answer. */
export async function askToNotify(): Promise<NotifyAnswer> {
  if (Platform.OS !== 'ios') return (pretend = 'on');
  try {
    return answerOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    // Without them the empty screen's "I need more time" has nowhere to lead; setup says so.
    return 'off';
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
