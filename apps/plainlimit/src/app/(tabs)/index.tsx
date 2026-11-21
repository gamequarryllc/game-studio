import { useRouter } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { wordFor } from '@/domain/battery';
import { clockLabelOf, durationLabel, goalLabel, untilLabel } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { topUpPlan } from '@/domain/puzzle';
import { passActive } from '@/domain/record';
import { batteryEnd } from '@/domain/recharge';
import { weekView } from '@/domain/week';
import { DEV_TOOLS, SCREEN_TIME_AVAILABLE, isOn, locksHeldUntil } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { Battery } from '@/ui/Battery';
import { CountingProblem } from '@/ui/CountingProblem';
import { BigButton, Label, StatusBand } from '@/ui/kit';
import { useEasedColor } from '@/ui/motion';
import { c, display } from '@/ui/theme';
import { TodayTotal, UsageReport } from '@/ui/UsageReport';
import { RecordCard } from '@/ui/RecordCard';
import { WeekView } from '@/ui/WeekView';
import { useDay } from '@/ui/useDay';

// Today: the top of the screen is the battery's colour, edge to edge, so the
// state of the day is the first thing seen and the only colour on the page.

export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { now, settings, day, cells, tone, accent } = useDay();
  const doc = useDoc();
  const { history, watching } = doc;
  const problem = store.health();
  // The phone tells the app about use in steps. The figure on screen is drawn
  // by the phone's Screen Time to the minute; the app's own stepped figure is
  // what fills the battery, and stands in until the phone has drawn.
  const counting = isOn();
  const field = useEasedColor(tone.bg);
  // The word is as large as the phone allows without breaking onto a second line.
  const width = Math.min(useWindowDimensions().width, 480);
  const wordSize = Math.min(58, Math.floor((width - 48) / 5.7));

  // When the next battery starts: the recharge, or a little later when a new recharge time is waiting (recharge.ts).
  const ends = batteryEnd(day, settings);
  const recharge = clockLabelOf(ends);
  const empty = cells === 0;
  // Setup's "start tomorrow": counting, but nothing locks before the recharge.
  const held = locksHeldUntil();
  const unlocked = isUnlocked(day, now);
  const passOn = passActive(doc.record, now);
  const passes = doc.record?.passes ?? 0;
  const passReady = store.passCheck() === 'ok';
  const next = topUpPlan(day.topUps);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView style={{ flex: 1, backgroundColor: c.ground }} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <Animated.View style={[styles.field, { backgroundColor: field, paddingTop: Math.max(insets.top, 12) + 16 }]}>
          <View style={styles.top}>
            <Text accessibilityRole="header" style={[styles.title, { color: tone.fg }]}>
              Today
            </Text>
            <Text style={[styles.goal, { color: tone.fg, borderColor: tone.fg }]}>{goalLabel(settings.goalMinutes)}</Text>
          </View>
          <Battery cells={cells} tone={tone} height={104} fill={field} />
          <View style={{ gap: 4 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.word, { color: tone.fg, fontSize: wordSize, lineHeight: wordSize + 2 }]}>
              {wordFor(cells)}
            </Text>
            <View style={styles.rechargeRow}>
              <Text style={[styles.recharge, { color: tone.fg }]}>Recharges at {recharge}</Text>
              <Text style={[styles.until, { color: tone.fg, opacity: tone.dark ? 0.9 : 0.72 }]}>{untilLabel(now, ends)}</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.rest}>
          <CountingProblem health={problem} />
          {held > 0 ? (
            <View style={[styles.strip, { borderColor: accent }]}>
              <Text style={styles.body}>Nothing locks until {clockLabelOf(new Date(held))}. Today was already past your goal when you set up.</Text>
            </View>
          ) : null}
          {unlocked ? (
            <View style={[styles.strip, { borderColor: accent }]}>
              <Text style={styles.body}>
                {passOn ? `Emergency pass: everything is open until ${clockLabelOf(new Date(day.unlockedUntil as string))}, settings too.` : `Earned time runs until ${clockLabelOf(new Date(day.unlockedUntil as string))}.`}
              </Text>
            </View>
          ) : null}
          {empty && !unlocked && held === 0 && settings.emptyLevel === 'work' ? (
            <BigButton label={`Solve ${next.sums} sums for ${next.minutes} more minutes`} onPress={() => router.push('/puzzle')} />
          ) : null}
          {empty && !unlocked && held === 0 && settings.emptyLevel === 'locked' ? (
            <View style={[styles.strip, { borderColor: accent }]}>
              <Text style={styles.body}>Locked until {recharge}. Apps that don&apos;t count still open.</Text>
            </View>
          ) : null}
          {empty && !unlocked && held === 0 && passReady ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Use an emergency pass, ${passes} saved`} onPress={() => router.push('/pass')} style={({ pressed }) => [styles.passRow, pressed ? { opacity: 0.8 } : null]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.passTitle}>Use an emergency pass</Text>
                <Text style={styles.passLine}>Opens everything, settings too, for 15 minutes. {passes} saved.</Text>
              </View>
              <Text style={styles.passChevron}>›</Text>
            </Pressable>
          ) : null}

          <View style={{ gap: 12 }}>
            {/* "Since 6:00 AM", not "today": the iPhone's Screen Time counts from midnight, and the two looked like a miscount side by side (the owner, build 111). */}
            <Label>{`Used since ${recharge}`}</Label>
            {counting ? (
              <View style={{ gap: 2 }}>
                <TodayTotal settings={settings} now={now} fallback={<Text style={styles.used}>{durationLabel(day.usedMinutes)}</Text>} />
                <Text style={styles.usedOfLine}>of {durationLabel(settings.goalMinutes)}, not counting essentials</Text>
              </View>
            ) : (
              <Text style={styles.used}>
                {durationLabel(day.usedMinutes)} <Text style={styles.usedOf}>of {durationLabel(settings.goalMinutes)}</Text>
              </Text>
            )}
          </View>

          <WeekView week={weekView(history, day, settings, now, !SCREEN_TIME_AVAILABLE || watching === true, doc.record?.uses)} />
          <RecordCard />

          {/* Last on the page: Apple's list sits in a box sized for five rows, and spare room at the end is only extra scroll. */}
          {counting ? (
            <UsageReport settings={settings} now={now} />
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={styles.body}>
                {SCREEN_TIME_AVAILABLE
                  ? problem === 'fine'
                    ? 'Counting is off, so nothing drains the battery and nothing locks. Turn it on in Settings, under Screen Time.'
                    : 'Nothing is being counted until this is fixed.'
                  : 'On an iPhone, the battery follows your real screen time.'}
              </Text>
              {DEV_TOOLS && !SCREEN_TIME_AVAILABLE ? <Text style={styles.note}>This preview has no real screen time. Drain the battery from Settings, under Developer.</Text> : null}
            </View>
          )}
        </View>
      </ScrollView>
      <StatusBand />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 24, paddingBottom: 30, gap: 26, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: display.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  goal: { fontSize: 14, fontWeight: '700', borderWidth: 1.5, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11, overflow: 'hidden' },
  word: { fontFamily: display.bold, fontSize: 58, lineHeight: 58, letterSpacing: -2.2 },
  rechargeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2, marginTop: 6 },
  recharge: { fontSize: 17, fontWeight: '700' },
  until: { fontSize: 17, fontWeight: '500' },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: c.outline, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  passTitle: { fontSize: 16, fontWeight: '600', color: c.ink },
  passLine: { fontSize: 13, lineHeight: 17, color: c.ink3 },
  passChevron: { fontSize: 22, color: c.ink3 },
  rest: { paddingHorizontal: 24, paddingTop: 28, gap: 26 },
  strip: { borderLeftWidth: 0, borderWidth: 1.5, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  used: { fontFamily: display.bold, fontSize: 48, lineHeight: 50, letterSpacing: -1.6, color: c.ink },
  usedOf: { fontFamily: display.semi, fontSize: 22, letterSpacing: -0.3, color: c.ink3 },
  usedOfLine: { fontFamily: display.semi, fontSize: 18, lineHeight: 22, letterSpacing: -0.2, color: c.ink3 },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
