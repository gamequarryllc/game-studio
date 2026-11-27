import { requireNativeView } from 'expo';
import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { Settings } from '@/domain/types';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, essentialsPicks, pickupWindow, reportWindow, setupWindow, wholeWindow } from '@/platform/screenTime';
import { Label } from '@/ui/kit';
import { durationLabel } from '@/domain/day';
import { useReducedMotion } from '@/ui/motion';
import { c, display } from '@/ui/theme';
import { WaitingDots } from '@/ui/Waiting';

interface NativeProps {
  fromMs: number;
  toMs: number;
  selection: string | null;
  /** Which of the extension's reports: the list or the day's total (with essentials chosen, the ones that leave them out), setup's picture, and so on. */
  context?: 'TopApps' | 'BatteryApps' | 'Total' | 'BatteryTotal' | `Setup${WeekHours}` | 'FirstApps' | 'Whole';
  /** The essentials that "BatteryApps", "BatteryTotal" and setup's picture leave out. The report reads them itself; handed over so a change of them draws the picture again. */
  minus?: string | null;
  style?: StyleProp<ViewStyle>;
}

// Only a build with the Screen Time pieces has this view; asking for it anywhere else would throw.
const NativeReport = SCREEN_TIME_AVAILABLE ? requireNativeView<NativeProps>('PlainlimitWidgets') : null;

/**
 * "What used it": the apps that have used the most battery since it
 * recharged. Apple's Screen Time draws the list inside this box; Plainlimit
 * only says which hours, and never sees what is drawn.
 * Essentials use no battery, so with some chosen the list asked for is the
 * one that leaves them out ("BatteryApps"). The phone's list can be asked for
 * every app or for a list of apps, never "every app but these", so the report
 * reads the essentials itself; if the phone will not let it, it lists every
 * app and says so (build 166 listed them all: Messages, an essential, stood
 * in the list and the owner took it for counted).
 * Draws nothing in a browser or in Expo Go, but for the preview's "?mock="
 * stand-in, which shows the box as it is before the phone has drawn.
 */
export function UsageReport({ settings, now }: { settings: Settings; now: Date }) {
  'use no memo';
  // The App Store screenshots leave out the box, which only a phone can fill.
  if (!NativeReport && (!MOCK_PHONE || STORE_SHOTS)) return null;
  const window = reportWindow(settings, now);
  return (
    <View style={{ gap: 10 }}>
      <Label>What used it</Label>
      {/* Nothing in the list can be tapped; touches pass to the screen behind so it still scrolls under a finger. */}
      {/* Sized for five rows, "and N more apps" and up to four lines of note (330 cut the note's third line), and with essentials for the two lines the list writes when it could not leave them out; it is last on Today, so spare room is only extra scroll at the end. */}
      <View pointerEvents="none" style={{ height: NativeReport && !window.exact ? 470 : 420, alignSelf: 'stretch' }}>
        {/* Shows through only until the phone has drawn the list over it. */}
        <View style={{ position: 'absolute', top: 14, left: 0, right: 0 }}>
          <Text style={{ fontSize: 16, lineHeight: 22, color: c.ink3 }}>Waiting for the phone&apos;s Screen Time to draw the list…</Text>
          <WaitingDots size={8} height={28} />
        </View>
        {NativeReport ? <NativeReport context={window.exact ? 'TopApps' : 'BatteryApps'} minus={window.exact ? null : essentialsPicks()} fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ flex: 1 }} /> : null}
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
function PhoneFigure({ context, minus, fromMs, toMs, selection, fallback, style }: { context: 'Total' | 'BatteryTotal'; minus: string | null; fromMs: number; toMs: number; selection: string | null; fallback: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!NativeReport) return <View style={style}>{fallback}</View>;
  return (
    <View pointerEvents="none" style={[{ height: 52, alignSelf: 'stretch' }, style]}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{fallback}</View>
      <NativeReport context={context} minus={minus} fromMs={fromMs} toMs={toMs} selection={selection} style={{ flex: 1 }} />
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}

/**
 * The day's figure, to the minute, as Apple's Screen Time counts it: every
 * minute every app has been used since the recharge. Plainlimit itself only
 * hears of use in steps, so `fallback` (its own figure, in the same type)
 * shows until the phone has drawn its number over it.
 * With essentials the figure asked for is the one that leaves their minutes
 * out ("BatteryTotal"), so it is what "What used it" adds up to. The report
 * reads the essentials itself, as the list does (build 167 on the owner's
 * phone: it can). If it cannot, it draws nothing, and Plainlimit's own figure
 * under it stands: a figure with the essentials in it would look as if they
 * had used the battery. (Up to build 167 Plainlimit's own figure always stood
 * here with essentials: it gives them the benefit of the doubt up to their
 * next rung, tally.ts, so it could read some minutes under the list.)
 */
export function TodayTotal({ settings, now, fallback, style }: { settings: Settings; now: Date; fallback: ReactNode; style?: StyleProp<ViewStyle> }) {
  'use no memo';
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? reportWindow(settings, now) : null;
  // Counting from a moment after the recharge (setup's "count from now"): the
  // phone's report goes by whole hours and would take in use from before it.
  if (!window || !window.fromRecharge) return <View style={style}>{fallback}</View>;
  return <PhoneFigure context={window.exact ? 'Total' : 'BatteryTotal'} minus={window.exact ? null : essentialsPicks()} fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} fallback={fallback} style={style} />;
}

/** The box for the iPhone's whole day, as in targets/report (WholeView): a small figure kept to the right. */
export const WHOLE = { width: 92, height: 32 } as const;

/**
 * The iPhone's whole day so far, every app, as the phone's own Screen Time
 * counts it (targets/report, WholeReport), drawn small at the right end of a
 * row on setup's last screen. Plainlimit never learns the number. `fallback`
 * shows until the phone has drawn, and wherever it can't.
 */
export function WholeTotal({ settings, now, fallback }: { settings: Settings; now: Date; fallback: ReactNode }) {
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? wholeWindow(settings, now) : null;
  return (
    <View pointerEvents="none" style={{ width: WHOLE.width, height: WHOLE.height }}>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, justifyContent: 'center' }}>{fallback}</View>
      {NativeReport && window ? (
        <>
          <NativeReport context="Whole" fromMs={window.fromMs} toMs={window.toMs} selection={null} style={{ flex: 1 }} />
          <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
        </>
      ) : null}
    </View>
  );
}

/**
 * Wakes the phone's Screen Time early in setup: a small drawing of the last
 * week, every app, out of sight, from the moment access is allowed, while the
 * essentials are still being picked. The first drawing after an install can
 * take a minute (the owner, builds 138 and 144), and the app can neither hurry
 * it nor tell when it is done; started here, most of that minute is over by
 * the time "How much a day?" asks for its chart. It reads the same days as the
 * chart will, every app.
 * Setup takes it away once the chart itself is on its way, so the phone is
 * never asked for both at once.
 *
 * It is drawn in full, under a cover the colour of the ground, and not made
 * clear: a clear view might not be drawn at all, and a nearly clear one leaves
 * a ghost of the figure on a dark screen.
 */
export function WakeScreenTime({ settings, now }: { settings: Settings; now: Date }) {
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? setupWindow(settings, now) : null;
  if (!NativeReport || !window) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, right: 0, width: WHOLE.width, height: WHOLE.height }}>
      <NativeReport context="Whole" fromMs={window.fromMs} toMs={window.toMs} selection={null} style={{ flex: 1 }} />
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.ground }} />
    </View>
  );
}

/**
 * Setup's "How much a day?" figures, in one picture drawn by the phone
 * (targets/report, SetupReport): today's figure, the daily average over the
 * seven days before today, and those seven days as bars, each with its time,
 * on an hour scale. The labels, the goal's dashed line and the shaded "would
 * lock" zone above it are the app's own, laid over the picture, so the line
 * moves as soon as the goal changes and the bars stay as they are. (Build 120
 * asked the phone to draw the line, passing the goal through the window's
 * length; the phone never got it, and the chart showed bare bars.)
 *
 * Up to build 138 these were three pictures, each read from the phone on its
 * own, the week twice over. On a fresh install the average came first and the
 * other two took about a minute (the owner). One picture is one reading, and
 * it all arrives together.
 *
 * Essentials already chosen are left out of the picture (the report reads
 * them itself, as for "What used it"): the goal is for what will use the
 * battery. Setup no longer asks for them, so this is a phone that chose them
 * under an older setup and never finished it.
 */
export function SetupFigures({ settings, now, todayLabel }: { settings: Settings; now: Date; todayLabel: string }) {
  'use no memo';
  // The scale is picked once, as the screen opens, and never changes while it is open (see `weekScale`), so the stepper only moves the line.
  const [hours] = useState(() => weekScale(settings.goalMinutes));
  const window = SCREEN_TIME_AVAILABLE && NativeReport ? setupWindow(settings, now) : null;
  if (!NativeReport || !window) return null;
  return (
    <View pointerEvents="none" style={{ height: SETUP.height, alignSelf: 'stretch' }}>
      {/* Under the phone's picture, and covered by it once drawn: dots where the figures go, stand-in bars where the chart goes. */}
      <View style={[setup.row, { top: SETUP.figureTop }]}>
        <View style={setup.half}>
          <WaitingDots />
        </View>
        <View style={setup.half}>
          <WaitingDots />
        </View>
      </View>
      <View style={setup.chart}>
        <WeekLoading />
      </View>
      <NativeReport context={`Setup${hours}`} minus={essentialsPicks()} fromMs={window.fromMs} toMs={window.toMs} selection={window.selection} style={{ flex: 1 }} />
      {/* Over the picture, in the room it leaves: the labels, and the goal's line on the chart. */}
      <View style={[setup.row, { top: 0 }]}>
        <Text numberOfLines={1} style={[setup.label, setup.half]}>
          {todayLabel}
        </Text>
        <Text numberOfLines={1} style={[setup.label, setup.half]}>
          Daily average
        </Text>
      </View>
      <View style={[setup.weekRow, { top: SETUP.weekLabelTop }]}>
        <Text numberOfLines={1} style={[setup.label, { flex: 1 }]}>
          Your last 7 days
        </Text>
        {/* The key to the chart's shading: the days over the goal's line are the ones that would have locked. */}
        <View accessible accessibilityLabel="Shaded: days that would have locked" style={setup.key}>
          <View style={setup.swatch} />
          <Text numberOfLines={1} style={setup.keyText}>
            Would lock
          </Text>
        </View>
      </View>
      <View style={setup.chart}>
        <GoalLine goalMinutes={settings.goalMinutes} hours={hours} />
      </View>
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}

/** The phone's chart: its height and, as in targets/report (weekTop, weekBottom, weekAxis, weekRight), the room over and under the bars, the hour scale's column, and the column on the right for the phone's goal to try. */
export const WEEK = { height: 150, top: 20, bottom: 22, axis: 30, right: 44 } as const;

/**
 * Setup's one picture, top to bottom, as in targets/report (setupFigureTop,
 * setupFigureGap, setupChartTop): a line of labels, the two figures side by
 * side (each 52 high, a gap between), the "Last 7 days" label, the chart.
 */
export const SETUP = { labelHeight: 16, figureTop: 20, figureGap: 12, weekLabelTop: 84, chartTop: 112, height: 112 + WEEK.height } as const;

const setup = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', gap: SETUP.figureGap },
  half: { flex: 1 },
  label: { fontSize: 13, lineHeight: SETUP.labelHeight, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: c.ink3 },
  chart: { position: 'absolute', left: 0, right: 0, top: SETUP.chartTop, height: WEEK.height },
  // The chart's own line of labels: what it shows on the left, the key to its shading on the right.
  weekRow: { position: 'absolute', left: 0, right: 0, height: SETUP.labelHeight, flexDirection: 'row', alignItems: 'center', gap: 10 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3, backgroundColor: 'rgba(255,123,107,0.45)' },
  keyText: { fontSize: 12, lineHeight: SETUP.labelHeight, fontWeight: '700', color: '#FF7B6B' },
});

/** Rough heights for the stand-in bars, as parts of the chart. */
const STAND_IN = [0.55, 0.45, 0.28, 0.5, 0.62, 0.34, 0.48];

/** After this long a load is said to be slow, and the goal can be picked without the bars. */
const SLOW_MS = 12_000;

/**
 * The chart before the phone has drawn it, laid out as the phone will draw it:
 * seven gray bars where the bars go, gently pulsing, and a tag in the middle
 * that says what is loading. It lies under the phone's chart, which covers it
 * once drawn; the app never learns when that is. Build 127 showed three dots
 * in the top corner instead, half under the goal's shaded zone (the owner).
 */
function WeekLoading() {
  const reduced = useReducedMotion();
  const [glow] = useState(() => new Animated.Value(1));
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.quad);
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.45, duration: 800, easing: ease, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 800, easing: ease, useNativeDriver: true }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [glow, reduced]);
  const plot = WEEK.height - WEEK.top - WEEK.bottom;
  return (
    <View style={loading.fill}>
      <Animated.View style={[loading.bars, { top: WEEK.top, height: plot, opacity: glow }]}>
        {STAND_IN.map((part, i) => (
          <View key={i} style={loading.slot}>
            <View style={[loading.bar, { height: plot * part }]} />
          </View>
        ))}
      </Animated.View>
      <View style={[loading.base, { top: WEEK.top + plot }]} />
      {/* Low in the chart: the goal's line, which the app lays over this, opens in the upper two thirds. */}
      <View style={[loading.low, { top: WEEK.top, height: plot }]}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={slow ? 'Still loading your last 7 days. The first time can take a minute. You can pick a goal without them.' : 'Loading your last 7 days'} style={loading.tag}>
          <View style={loading.tagRow}>
            <Text style={loading.tagText}>{slow ? 'Still loading' : 'Loading your last 7 days'}</Text>
            <WaitingDots size={5} height={10} />
          </View>
          {/* Said plainly: the phone's first drawing after an install is slow, and the app can't hurry it or tell how far along it is.
              One line, so the tag stays under the goal's line (the stepper and Next say for themselves that a goal can be picked). */}
          {slow ? <Text style={loading.slowText}>The first time can take a minute.</Text> : null}
        </View>
      </View>
    </View>
  );
}

const loading = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bars: { position: 'absolute', left: WEEK.axis, right: WEEK.right, flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, alignItems: 'center' },
  bar: { width: 20, borderRadius: 6, backgroundColor: c.raised },
  base: { position: 'absolute', left: WEEK.axis, right: WEEK.right, height: 1, backgroundColor: c.rule },
  low: { position: 'absolute', left: WEEK.axis, right: WEEK.right, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
  tag: { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: c.ground, borderWidth: 1, borderColor: c.rule },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagText: { fontSize: 13, fontWeight: '600', color: c.ink2 },
  slowText: { fontSize: 12, color: c.ink3 },
});

/**
 * The chart's scales, in hours: the smallest that leaves room above the goal
 * the screen opened with. It is picked once and kept while the screen is
 * open, and a goal past its top waits at the top (`aboveChart`). Each scale is
 * its own report, which the phone draws from scratch: picking the scale afresh
 * on each step redrew the bars at 2:45, 4:15 and 5:30, and the phone took 30
 * seconds or more, or never drew them again (the owner, build 123). Growing
 * the scale once the goal passed its top still redrew them, and the phone
 * never finished, even back at the old goal (build 124).
 */
const WEEK_SCALES = [4, 6, 8, 12] as const;
export type WeekHours = (typeof WEEK_SCALES)[number];
export function weekScale(goalMinutes: number): WeekHours {
  return WEEK_SCALES.find((h) => h * 60 >= goalMinutes * 1.5) ?? 12;
}

/** Whether the goal is past the top of the scale, where its line waits, marked with an arrow. */
export function aboveChart(goalMinutes: number, hours: number): boolean {
  return goalMinutes > hours * 60;
}

/** Where the goal stands on the chart, from its top, in points. */
export function goalY(goalMinutes: number, hours: number): number {
  const plot = WEEK.height - WEEK.top - WEEK.bottom;
  return WEEK.top + plot - plot * Math.min(1, goalMinutes / (hours * 60));
}

/** The hours the phone marks down the chart's left side, as in targets/report (WeekBarsView's `step`): every hour up to 4, every third at 12, else every second. */
export function hourMarks(hours: number): number[] {
  const step = hours <= 4 ? 1 : hours >= 12 ? 3 : 2;
  const marks: number[] = [];
  for (let hour = step; hour <= hours; hour += step) marks.push(hour);
  return marks;
}

/** How near the goal's time has to come to an hour mark, in points, to cover it whole, and where the mark is clear of it again. */
const MARK_HIDDEN = 17;
const MARK_CLEAR = 18;

const DASHES = Array.from({ length: 34 }, (_, i) => i);

/** The goal as a dashed line with its time, and the days above it shaded as the ones that would have locked. Past the top of the scale it waits at the top, its time marked with an arrow. */
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
      {/* What the shading means is said over the chart, beside "Your last 7 days" (SetupFigures). Written in here it lay over a tall bar's time (the owner, build 167: "Would lock" across "7:18"). */}
      <Animated.View style={[line.zone, { height: y }]} />
      <Animated.View style={[line.dashes, { top: Animated.subtract(y, 1) }]}>
        {DASHES.map((i) => (
          <View key={i} style={line.dash} />
        ))}
      </Animated.View>
      {/* The goal's time shares the hour scale's column. An hour mark it would half cover ("4h" behind "3:30") is covered whole, in the ground's colour, until the time has moved clear. */}
      {hourMarks(hours).map((hour) => {
        const at = goalY(hour * 60, hours);
        const opacity = y.interpolate({ inputRange: [at - MARK_CLEAR, at - MARK_HIDDEN, at + MARK_HIDDEN, at + MARK_CLEAR], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
        return <Animated.View key={hour} style={[line.mark, { top: at - 9, opacity }]} />;
      })}
      <Animated.View style={[line.pill, { top: Animated.subtract(y, 11) }]}>
        <Text style={line.pillText}>{aboveChart(goalMinutes, hours) ? `${durationLabel(goalMinutes)} \u2191` : durationLabel(goalMinutes)}</Text>
      </Animated.View>
    </>
  );
}

const line = StyleSheet.create({
  zone: { position: 'absolute', top: 0, left: WEEK.axis, right: WEEK.right, backgroundColor: 'rgba(255,123,107,0.14)', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  // Stops at the phone's column on the right, where its "Try" tag sits, so it runs into the tag rather than over it.
  dashes: { position: 'absolute', left: WEEK.axis, right: WEEK.right, height: 2, flexDirection: 'row', gap: 5, overflow: 'hidden' },
  dash: { width: 6, height: 2, borderRadius: 1, backgroundColor: c.ink },
  // As wide as the hour scale's column short of the chart's lines, and as tall as a mark.
  mark: { position: 'absolute', left: 0, width: WEEK.axis - 3, height: 18, backgroundColor: c.ground },
  // Over the hour scale's column, where it hides no bar's time.
  pill: { position: 'absolute', left: 0, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.ink, justifyContent: 'center' },
  pillText: { fontFamily: display.bold, fontSize: 13, color: c.onPaper },
});

/** Four rows of the phone's list of apps opened first after a pickup. */
export const FIRST_APPS_HEIGHT = 4 * 56 + 3;

/**
 * The apps opened first after picking up the phone over the last seven days,
 * with how many times, drawn by the phone like Screen Time's "First Used After
 * Pickup" (the owner, 2026-11-21: suggestions for Second thought). Plainlimit
 * never learns which apps they are, so it can only show them, not tick them.
 * The preview's "?mock=" stand-in shows the box as it is before the phone has
 * drawn; anywhere else without the phone it draws nothing.
 */
export function FirstPickupApps({ now }: { now: Date }) {
  if (!NativeReport && (!MOCK_PHONE || STORE_SHOTS)) return null;
  const window = pickupWindow(now);
  return (
    <View pointerEvents="none" style={{ height: FIRST_APPS_HEIGHT, alignSelf: 'stretch' }}>
      <View style={{ position: 'absolute', top: 12, left: 0, right: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink3 }}>Waiting for the phone&apos;s Screen Time…</Text>
        <WaitingDots size={8} height={28} />
      </View>
      {NativeReport ? <NativeReport context="FirstApps" fromMs={window.fromMs} toMs={window.toMs} selection={null} style={{ flex: 1 }} /> : null}
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}
