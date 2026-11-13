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
      {/* Nothing in the list can be tapped; touches pass to the screen behind so it still scrolls under a finger. */}
      <View pointerEvents="none" style={{ height: 300, alignSelf: 'stretch' }}>
        {/* Shows through only until the phone has drawn the list over it. */}
        <Text style={{ position: 'absolute', top: 14, left: 0, right: 0, fontSize: 16, lineHeight: 22, color: c.ink3 }}>Waiting for the phone&apos;s Screen Time to draw the list…</Text>
        <NativeReport fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ flex: 1 }} />
        {/* The list is drawn by another process, which would otherwise be handed every touch on it; this almost clear sheet is the app's own and lies on top. */}
        <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
      </View>
      <Text style={{ fontSize: 13, lineHeight: 18, color: c.ink3 }}>Drawn by the phone&apos;s Screen Time. Plainlimit never sees this list, and it can be a little behind.</Text>
    </View>
  );
}
