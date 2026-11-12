import { requireNativeView } from 'expo';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import type { Settings } from '@/domain/types';
import { SCREEN_TIME_AVAILABLE, reportWindow } from '@/platform/screenTime';
import { Label } from '@/ui/kit';
import { c } from '@/ui/theme';

interface NativeProps {
  fromMs: number;
  toMs: number;
  selection: string | null;
  style?: StyleProp<ViewStyle>;
}

// Only a build with the Screen Time pieces has this view; asking for it anywhere else would throw.
const NativeReport = SCREEN_TIME_AVAILABLE ? requireNativeView<NativeProps>('PlainlimitWidgets') : null;

/**
 * "What used it": the apps that have used the most time since the battery
 * recharged. Apple's Screen Time draws the list inside this box; Plainlimit
 * only says which hours and which apps, and never sees what is drawn.
 * Draws nothing in a browser or in Expo Go.
 */
export function UsageReport({ settings, now }: { settings: Settings; now: Date }) {
  if (!NativeReport) return null;
  const window = reportWindow(settings, now);
  return (
    <View style={{ gap: 10 }}>
      <Label>What used it</Label>
      <NativeReport fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ height: 300, alignSelf: 'stretch' }} />
      <Text style={{ fontSize: 13, lineHeight: 18, color: c.ink3 }}>Drawn by the phone&apos;s Screen Time. Plainlimit never sees this list, and it can be a little behind.</Text>
    </View>
  );
}
