import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Small taps under the finger. They do nothing on the web preview, and a
// failure here must never get in the way of what the person was doing.

const on = Platform.OS === 'ios' || Platform.OS === 'android';

export function tap(): void {
  if (on) Haptics.selectionAsync().catch(() => {});
}

export function thump(): void {
  if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function success(): void {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function warning(): void {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
