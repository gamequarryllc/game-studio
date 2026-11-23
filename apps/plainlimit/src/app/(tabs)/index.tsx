import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { wordFor } from '@/domain/battery';
import { clockLabelOf, durationLabel, untilLabel } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { topUpPlan } from '@/domain/puzzle';
import { passActive, passRow } from '@/domain/record';
import { batteryEnd } from '@/domain/recharge';
import { glowAt } from '@/domain/tone';
import { weekView } from '@/domain/week';
import { DEV_TOOLS, SCREEN_TIME_AVAILABLE, isOn, locksHeldUntil } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { CountingProblem } from '@/ui/CountingProblem';
import { NoticesOff } from '@/ui/NoticesOff';
import { GlowBattery, GlowField } from '@/ui/GlowBattery';
import { BigButton, Card, LinkRow, StatusBand, tiles } from '@/ui/kit';
import { PassRow } from '@/ui/PassRow';
import { useRecord, weekday } from '@/ui/RecordCard';
import { c, display } from '@/ui/theme';
import { TodayTotal, UsageReport } from '@/ui/UsageReport';
import { WeekView } from '@/ui/WeekView';
import { useDay } from '@/ui/useDay';

// Today, in the look of the app's icon and widget (the owner's pick,
// 2026-11-22): a dark page, a battery whose cells shine in the day's colour,
// and only today on it: the word, the recharge, what has been used, and the
// week as seven bars. The record, the passes and the list of apps are one tap
// away, on History. Up to build 129 the top of the page was a flat field of
// the day's colour and everything was on one long scroll.

export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { now, settings, day, cells, fraction } = useDay();
  const doc = useDoc();
  const { history, watching } = doc;
  const problem = store.health();
  // The phone tells the app about use in steps. The figure on screen is drawn
  // by the phone's Screen Time to the minute; the app's own stepped figure is
  // what fills the battery, and stands in until the phone has drawn.
  const counting = isOn();
  // The day's colour as light on the dark page: the cells, the word and the glow behind them.
  const glow = glowAt(fraction);
  const width = Math.min(useWindowDimensions().width, 480);
  // The word is as large as the phone allows without breaking onto a second line.
  const wordSize = Math.min(60, Math.floor((width - 48) / 5.7));
  const batteryHeight = Math.round(Math.min(128, (width - 48) * 0.375));
  // Where the battery starts, clear of the clock.
  const top = Math.max(insets.top, 12) + 28;
  const [scrolled, setScrolled] = useState(false);

  // When the next battery starts: the recharge, or a little later when a new recharge time is waiting (recharge.ts).
  const ends = batteryEnd(day, settings);
  const recharge = clockLabelOf(ends);
  const empty = cells === 0;
  // Setup's "start tomorrow": counting, but nothing locks before the recharge.
  const held = locksHeldUntil();
  const unlocked = isUnlocked(day, now);
  const passOn = passActive(doc.record, now);
  const { view: record } = useRecord();
  // The emergency pass is always on Today: red under an empty battery that is locking apps, grey beside History otherwise.
  const pass = passRow(store.passCheck(), empty && !unlocked && held === 0, record.streakDays, weekday(record.nextPass));
  const passLine = <PassRow usable={pass.usable} sub={pass.sub} passes={record.passes} color={glow} onPress={() => router.push('/pass')} />;
  const next = topUpPlan(day.topUps);
  const figure = <Text style={styles.used}>{durationLabel(day.usedMinutes)}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView style={{ flex: 1, backgroundColor: c.ground }} scrollEventThrottle={32} onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 4)} contentContainerStyle={{ paddingBottom: insets.bottom + 28 + (Platform.OS === 'web' ? 96 : 0) }}>
        <GlowField color={glow} width={width} centre={top + batteryHeight / 2} reach={batteryHeight / 2 + 150} />
        <View style={[styles.field, { paddingTop: top }]}>
          <Text accessibilityRole="header" style={styles.hidden}>
            Today
          </Text>
          <GlowBattery cells={cells} color={glow} height={batteryHeight} />
          <View style={{ gap: 8, marginTop: 30 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.word, { color: glow, fontSize: wordSize, lineHeight: wordSize + 2 }]}>
              {wordFor(cells)}
            </Text>
            <View style={styles.rechargeRow}>
              <Text style={styles.recharge}>Recharges at {recharge}</Text>
              <Text style={styles.until}>{untilLabel(now, ends)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rest}>
          <CountingProblem health={problem} />
          {/* Only while counting: with it off, nothing would send one. */}
          {counting ? <NoticesOff asks={settings.emptyLevel === 'work' || settings.askFirst?.on === true} /> : null}
          {held > 0 ? (
            <View style={styles.strip}>
              <Text style={styles.body}>Nothing locks until {clockLabelOf(new Date(held))}. Today was already past your goal when you set up.</Text>
            </View>
          ) : null}
          {unlocked ? (
            <View style={[styles.strip, { borderColor: glow }]}>
              <Text style={styles.body}>
                {passOn ? `Emergency pass: everything is open until ${clockLabelOf(new Date(day.unlockedUntil as string))}, settings too.` : `Earned time runs until ${clockLabelOf(new Date(day.unlockedUntil as string))}.`}
              </Text>
            </View>
          ) : null}
          {/* An empty battery: what can be done about it sits right under it. */}
          {empty && !unlocked && held === 0 && (settings.emptyLevel !== 'warn' || pass.usable) ? (
            <View style={{ gap: 12 }}>
              {settings.emptyLevel === 'work' ? <BigButton label={`Solve ${next.sums} sums for ${next.minutes} more minutes`} onPress={() => router.push('/puzzle')} /> : null}
              {settings.emptyLevel === 'locked' ? (
                <View style={styles.strip}>
                  <Text style={styles.body}>Locked until {recharge}. Apps that don&apos;t count still open.</Text>
                </View>
              ) : null}
              {pass.usable ? passLine : null}
            </View>
          ) : null}

          {/* Used, of the goal. The phone draws its own figure, to the minute, over the app's stepped one. */}
          <View accessible accessibilityLabel={`${durationLabel(day.usedMinutes)} used of ${durationLabel(settings.goalMinutes)}, since ${recharge}, not counting essentials`} style={styles.usedRow}>
            <View>
              {/* Holds the figure's room; the phone's own figure is drawn over it. */}
              <View style={counting ? { opacity: 0 } : null}>{figure}</View>
              {counting ? <TodayTotal settings={settings} now={now} fallback={figure} style={styles.usedPhone} /> : null}
            </View>
            <Text style={styles.usedOf}>used of {durationLabel(settings.goalMinutes)}</Text>
          </View>

          <WeekView compact week={weekView(history, day, settings, now, !SCREEN_TIME_AVAILABLE || watching === true, doc.record?.uses)} />

          <View style={{ gap: 12 }}>
            <Card>
              <LinkRow icon={{ name: 'history', bg: tiles.blue }} label="History" sub="Your record and passes" onPress={() => router.push('/record')} last />
            </Card>
            {pass.usable ? null : passLine}
          </View>

          {/* Last on the page: Apple's list sits in a box sized for five rows, and spare room at the end is only extra scroll.
              It went to History with the overhaul and came back the same day: the owner still wants it here (2026-11-22). */}
          {counting ? (
            <UsageReport settings={settings} now={now} />
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={styles.body}>
                {SCREEN_TIME_AVAILABLE
                  ? problem === 'fine'
                    ? 'Counting is off, so nothing drains the battery and nothing locks. Turn it on in Settings.'
                    : 'Nothing is being counted until this is fixed.'
                  : 'On an iPhone, the battery follows your real screen time.'}
              </Text>
              {DEV_TOOLS && !SCREEN_TIME_AVAILABLE ? <Text style={styles.note}>This preview has no real screen time. Drain the battery from Settings, under Developer.</Text> : null}
            </View>
          )}
        </View>
      </ScrollView>
      {/* Only once the page has moved: at rest the glow runs up behind the clock. */}
      {scrolled ? <StatusBand /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 24 },
  // "Today" is said to screen readers; the tab bar already shows it.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  // No shadow on the word. It had one as its light, and on an iPhone the light stopped dead at the edges of the
  // text's own box: a faint lit rectangle behind the word (builds 134 and 137; padding round the text did not
  // move the edges). The battery's light above is enough.
  word: { fontFamily: display.bold, fontSize: 60, lineHeight: 62, letterSpacing: -2.2 },
  rechargeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  recharge: { fontSize: 17, fontWeight: '600', color: c.ink2 },
  until: { fontSize: 17, fontWeight: '400', color: c.ink3 },
  rest: { paddingHorizontal: 24, paddingTop: 32, gap: 24 },
  strip: { borderWidth: 1.5, borderColor: c.outline, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  // The figure's box is a little wider than the app's own figure: the phone's may be a digit's width off.
  usedRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  used: { fontFamily: display.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.6, color: c.ink, fontVariant: ['tabular-nums'], paddingRight: 10 },
  usedPhone: { position: 'absolute', left: 0, top: 0, right: 0, height: 52, alignSelf: 'auto' },
  usedOf: { fontFamily: display.semi, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, color: c.ink3, paddingBottom: 7 },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
