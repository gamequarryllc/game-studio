import { useRouter } from 'expo-router';
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { wordFor } from '@/domain/battery';
import { clockLabel, clockLabelOf, durationLabel, goalLabel, nextRecharge, untilLabel } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { topUpPlan } from '@/domain/puzzle';
import { weekView } from '@/domain/week';
import { DEV_TOOLS, SCREEN_TIME_AVAILABLE, isOn } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { Battery } from '@/ui/Battery';
import { CountingProblem } from '@/ui/CountingProblem';
import { BigButton, Label } from '@/ui/kit';
import { useEasedColor } from '@/ui/motion';
import { Ruler } from '@/ui/Ruler';
import { c, display } from '@/ui/theme';
import { TodayTotal, UsageReport } from '@/ui/UsageReport';
import { WeekView } from '@/ui/WeekView';
import { useDay } from '@/ui/useDay';

// Today: the top of the screen is the battery's colour, edge to edge, so the
// state of the day is the first thing seen and the only colour on the page.

export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { now, settings, day, fraction, cells, tone, accent } = useDay();
  const { history, watching } = useDoc();
  const problem = store.health();
  // The phone tells the app about use in steps. The figure on screen is drawn
  // by the phone's Screen Time to the minute; the app's own stepped figure is
  // what fills the battery, and stands in until the phone has drawn.
  const counting = isOn();
  const field = useEasedColor(tone.bg);
  // The word is as large as the phone allows without breaking onto a second line.
  const width = Math.min(useWindowDimensions().width, 480);
  const wordSize = Math.min(58, Math.floor((width - 48) / 5.7));

  const recharge = clockLabel(settings.rechargeMinute);
  const empty = cells === 0;
  const unlocked = isUnlocked(day, now);
  const next = topUpPlan(day.topUps);

  return (
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
            <Text style={[styles.until, { color: tone.fg }]}>{untilLabel(now, nextRecharge(now, settings.rechargeMinute))}</Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.rest}>
        <CountingProblem health={problem} />
        {unlocked ? (
          <View style={[styles.strip, { borderColor: accent }]}>
            <Text style={styles.body}>Earned time runs until {clockLabelOf(new Date(day.unlockedUntil as string))}.</Text>
          </View>
        ) : null}
        {empty && !unlocked && settings.emptyLevel === 'work' ? (
          <BigButton label={`Solve ${next.sums} sums for ${next.minutes} more minutes`} onPress={() => router.push('/puzzle')} />
        ) : null}
        {empty && !unlocked && settings.emptyLevel === 'locked' ? (
          <View style={[styles.strip, { borderColor: accent }]}>
            <Text style={styles.body}>Locked until {recharge}. Apps that don&apos;t count still open.</Text>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <Label>Used today</Label>
          {counting ? (
            <View style={{ gap: 2 }}>
              <TodayTotal settings={settings} now={now} fallback={<Text style={styles.used}>{durationLabel(day.usedMinutes)}</Text>} />
              <Text style={styles.usedOfLine}>of {durationLabel(settings.goalMinutes)}, in apps that count</Text>
            </View>
          ) : (
            <Text style={styles.used}>
              {durationLabel(day.usedMinutes)} <Text style={styles.usedOf}>of {durationLabel(settings.goalMinutes)}</Text>
            </Text>
          )}
          <Ruler fraction={fraction} color={accent} />
        </View>

        {counting ? <UsageReport settings={settings} now={now} /> : null}

        <WeekView week={weekView(history, day, settings, now, !SCREEN_TIME_AVAILABLE || watching === true)} />

        <View style={{ gap: 6 }}>
          <Text style={styles.body}>
            {counting
              ? 'The figure is the phone\'s own Screen Time count. The battery hears of it every few minutes, so it moves in steps and can be a cell behind.'
              : SCREEN_TIME_AVAILABLE
                ? problem === 'fine'
                  ? 'Counting is off, so nothing drains the battery and nothing locks. Turn it on in Settings, under Screen Time.'
                  : 'Nothing is being counted until this is fixed.'
                : 'On an iPhone, the battery follows your real screen time.'}
          </Text>
          {DEV_TOOLS && !SCREEN_TIME_AVAILABLE ? <Text style={styles.note}>This preview has no real screen time. Drain the battery from Settings, under Developer.</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 24, paddingBottom: 30, gap: 26, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: display.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  goal: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', borderWidth: 1.5, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11, overflow: 'hidden' },
  word: { fontFamily: display.bold, fontSize: 58, lineHeight: 58, letterSpacing: -2.2 },
  rechargeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  recharge: { fontSize: 17, fontWeight: '700' },
  until: { fontSize: 17, fontWeight: '500' },
  rest: { paddingHorizontal: 24, paddingTop: 28, gap: 26 },
  strip: { borderLeftWidth: 0, borderWidth: 1.5, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  used: { fontFamily: display.bold, fontSize: 48, lineHeight: 50, letterSpacing: -1.6, color: c.ink },
  usedOf: { fontFamily: display.semi, fontSize: 22, letterSpacing: -0.3, color: c.ink3 },
  usedOfLine: { fontFamily: display.semi, fontSize: 18, lineHeight: 22, letterSpacing: -0.2, color: c.ink3 },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
