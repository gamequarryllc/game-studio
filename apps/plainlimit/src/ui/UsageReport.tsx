import { requireNativeView } from 'expo';
import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { Settings } from '@/domain/types';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, averageWindow, reportWindow } from '@/platform/screenTime';
import { Label } from '@/ui/kit';
import { durationLabel } from '@/domain/day';
import { useReducedMotion } from '@/ui/motion';
import { c, display } from '@/ui/theme';
import { WaitingDots } from '@/ui/Waiting';

interface NativeProps {
  fromMs: number;
  toMs: number;
  selection: string | null;
  /** Which of the extension's reports: the list, or the day's total. */
  context?: 'TopApps' | 'Total' | 'Average' | WeekContext;
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
  // The App Store screenshots leave out the box, which only a phone can fill.
  if (!NativeReport && (!MOCK_PHONE || STORE_SHOTS)) return null;
  const window = reportWindow(settings, now);
  return (
    <View style={{ gap: 10 }}>
      <Label>What used it</Label>
      {/* Nothing in the list can be tapped; touches pass to the screen behind so it still scrolls under a finger. */}
      {/* Sized for five rows, "and N more apps" and up to four lines of note (330 cut the note's third line); it is last on Today, so spare room is only extra scroll at the end. */}
      <View pointerEvents="none" style={{ height: 420, alignSelf: 'stretch' }}>
        {/* Shows through only until the phone has drawn the list over it. */}
        <View style={{ position: 'absolute', top: 14, left: 0, right: 0 }}>
          <Text style={{ fontSize: 16, lineHeight: 22, color: c.ink3 }}>Waiting for the phone&apos;s Screen Time to draw the list…</Text>
          <WaitingDots size={8} height={28} />
        </View>
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

/**
 * The seven days before today as bars, each with its time, on an hour scale:
 * drawn by the phone (targets/report, WeekReport). The goal's dashed line and
 * the shaded "would lock" zone above it are the app's own, laid over the
 * chart, so they move as soon as the goal changes. (Build 120 asked the phone
 * to draw the line, passing the goal through the window's length; the phone
 * never got it, and the chart showed bare bars.)
 */
export function WeekBars({ settings, now, fallback }: { settings: Settings; now: Date; fallback: ReactNode }) {
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? averageWindow(settings, now) : null;
  if (!NativeReport || !window || !window.selection) return <View>{fallback}</View>;
  const hours = weekScale(settings.goalMinutes);
  return (
    <View pointerEvents="none" style={{ height: WEEK.height, alignSelf: 'stretch' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{fallback}</View>
      <NativeReport context={`Week${hours}`} fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ flex: 1 }} />
      <GoalLine goalMinutes={settings.goalMinutes} hours={hours} />
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}

type WeekContext = 'Week4' | 'Week6' | 'Week8' | 'Week12';

/** The phone's chart: its height and, as in targets/report (weekTop, weekBottom, weekAxis), the room over and under the bars and the hour scale's column. */
export const WEEK = { height: 150, top: 20, bottom: 22, axis: 30 } as const;

/** The chart's scales, in hours: the smallest that leaves room above the goal. */
const WEEK_SCALES = [4, 6, 8, 12] as const;
export function weekScale(goalMinutes: number): (typeof WEEK_SCALES)[number] {
  return WEEK_SCALES.find((h) => h * 60 >= goalMinutes * 1.5) ?? 12;
}

/** Where the goal stands on the chart, from its top, in points. */
export function goalY(goalMinutes: number, hours: number): number {
  const plot = WEEK.height - WEEK.top - WEEK.bottom;
  return WEEK.top + plot - plot * Math.min(1, goalMinutes / (hours * 60));
}

const DASHES = Array.from({ length: 34 }, (_, i) => i);

/** The goal as a dashed line with its time, and the days above it shaded as the ones that would have locked. */
function GoalLine({ goalMinutes, hours }: { goalMinutes: number; hours: number }) {
  const reduced = useReducedMotion();
  const target = goalY(goalMinutes, hours);
  const [y] = useState(() => new Animated.Value(target));
  useEffect(() => {
    const run = Animated.timing(y, { toValue: target, duration: reduced ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [target, y, reduced]);
  return (
    <>
      <Animated.View style={[line.zone, { height: y }]}>{target > 30 ? <Text style={line.zoneText}>Would lock</Text> : null}</Animated.View>
      <Animated.View style={[line.dashes, { top: Animated.subtract(y, 1) }]}>
        {DASHES.map((i) => (
          <View key={i} style={line.dash} />
        ))}
      </Animated.View>
      <Animated.View style={[line.pill, { top: Animated.subtract(y, 11) }]}>
        <Text style={line.pillText}>{durationLabel(goalMinutes)}</Text>
      </Animated.View>
    </>
  );
}

const line = StyleSheet.create({
  zone: { position: 'absolute', top: 0, left: WEEK.axis, right: 0, backgroundColor: 'rgba(255,123,107,0.14)', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  zoneText: { position: 'absolute', left: 6, top: 3, fontSize: 11, fontWeight: '700', color: '#FF7B6B' },
  dashes: { position: 'absolute', left: WEEK.axis, right: 0, height: 2, flexDirection: 'row', gap: 5, overflow: 'hidden' },
  dash: { width: 6, height: 2, borderRadius: 1, backgroundColor: c.ink },
  // Over the hour scale's column, where it hides no bar's time.
  pill: { position: 'absolute', left: 0, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.ink, justifyContent: 'center' },
  pillText: { fontFamily: display.bold, fontSize: 13, color: c.onPaper },
});
