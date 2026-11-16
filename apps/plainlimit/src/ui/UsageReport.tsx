import { requireNativeView } from 'expo';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import type { Settings } from '@/domain/types';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, averageWindow, reportWindow } from '@/platform/screenTime';
import { Label } from '@/ui/kit';
import { c } from '@/ui/theme';

interface NativeProps {
  fromMs: number;
  toMs: number;
  selection: string | null;
  /** Which of the extension's reports: the list, or the day's total. */
  context?: 'TopApps' | 'Total' | 'Average';
  style?: StyleProp<ViewStyle>;
}

// Only a build with the Screen Time pieces has this view; asking for it anywhere else would throw.
const NativeReport = SCREEN_TIME_AVAILABLE ? requireNativeView<NativeProps>('PlainlimitWidgets') : null;

/**
 * "What used it": the apps that have used the most time since the battery
 * recharged. Apple's Screen Time draws the list inside this box; Plainlimit
 * only says which hours and which apps, and never sees what is drawn.
 * Draws nothing in a browser or in Expo Go, but for the preview's "?mock="
 * stand-in, which shows the box as it is before the phone has drawn.
 */
export function UsageReport({ settings, now }: { settings: Settings; now: Date }) {
  if (!NativeReport && !MOCK_PHONE) return null;
  const window = reportWindow(settings, now);
  return (
    <View style={{ gap: 10 }}>
      <Label>What used it</Label>
      {/* Nothing in the list can be tapped; touches pass to the screen behind so it still scrolls under a finger. */}
      {/* Sized for five rows, "and N more apps" and up to four lines of note (330 cut the note's third line); it is last on Today, so spare room is only extra scroll at the end. */}
      <View pointerEvents="none" style={{ height: 420, alignSelf: 'stretch' }}>
        {/* Shows through only until the phone has drawn the list over it. */}
        <Text style={{ position: 'absolute', top: 14, left: 0, right: 0, fontSize: 16, lineHeight: 22, color: c.ink3 }}>Waiting for the phone&apos;s Screen Time to draw the list…</Text>
        {NativeReport ? <NativeReport fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ flex: 1 }} /> : null}
        {/* The list is drawn by another process, which would otherwise be handed every touch on it; this almost clear sheet is the app's own and lies on top. */}
        <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
      </View>
    </View>
  );
}

/**
 * A figure drawn by the phone's Screen Time over `fallback` (shown until it has
 * drawn, and wherever it can't). Plainlimit never learns the number it shows.
 */
function PhoneFigure({ context, fromMs, toMs, selection, fallback, style }: { context: 'Total' | 'Average'; fromMs: number; toMs: number; selection: string; fallback: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!NativeReport) return <View style={style}>{fallback}</View>;
  return (
    <View pointerEvents="none" style={[{ height: 52, alignSelf: 'stretch' }, style]}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{fallback}</View>
      <NativeReport context={context} fromMs={fromMs} toMs={toMs} selection={selection} style={{ flex: 1 }} />
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}

/**
 * The day's figure, to the minute, as Apple's Screen Time counts it: every
 * minute the counted apps have been used since the recharge. Plainlimit itself
 * only hears of use in steps, so `fallback` (its own figure, in the same type)
 * shows until the phone has drawn its number over it.
 */
export function TodayTotal({ settings, now, fallback, style }: { settings: Settings; now: Date; fallback: ReactNode; style?: StyleProp<ViewStyle> }) {
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? reportWindow(settings, now) : null;
  // Counting from a moment after the recharge (setup's "count from now"): the
  // phone's report goes by whole hours and would take in use from before it.
  if (!window || !window.fromRecharge || !window.selection) return <View style={style}>{fallback}</View>;
  return <PhoneFigure context="Total" fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} fallback={fallback} style={style} />;
}

/** The counted apps' use over the seven days before today, a day on average, drawn by the phone. For picking a goal. */
export function WeekAverage({ settings, now, fallback, style }: { settings: Settings; now: Date; fallback: ReactNode; style?: StyleProp<ViewStyle> }) {
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? averageWindow(settings, now) : null;
  if (!window || !window.selection) return <View style={style}>{fallback}</View>;
  return <PhoneFigure context="Average" fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} fallback={fallback} style={style} />;
}
