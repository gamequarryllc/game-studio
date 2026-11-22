import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { CELLS, cellWords } from '@/domain/battery';
import { clockLabelOf, durationLabel } from '@/domain/day';
import { chosenGoal, goalFree } from '@/domain/goal';
import { topUpPlan } from '@/domain/puzzle';
import { batteryEnd } from '@/domain/recharge';
import type { EmptyLevel } from '@/domain/types';
import { EXPECTED_PRICE } from '@/pro/config';
import { pro, usePro } from '@/pro/pro';
import { COUNTED_ID, DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, essentialsCount, essentialsMode, isOn, pickCount } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { tap } from '@/platform/haptics';
import { Icon, type IconName } from '@/ui/icons';
import { BigButton, Card, Chevron, IconTile, Label, LinkRow, Page, StepButton, Title, tiles } from '@/ui/kit';
import { essentialsValue } from '@/ui/countWords';
import { TIPS } from '@/ui/tips';
import { ScreenTimeCard, TestBuildTools } from '@/ui/ScreenTimeCard';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

export default function Settings() {
  // Drawn afresh each time: it asks the phone things as it draws (is counting
  // on, are the settings locked), which the React Compiler would otherwise keep
  // from the first drawing (the goal's buttons never looked closed at a limit).
  'use no memo';
  const router = useRouter();
  const { settings, day, accent } = useDay();
  const first = topUpPlan(0);
  // Read the picks again whenever this tab comes back into view: a tab out of
  // view is not redrawn, and after a change on the Essentials screen the row
  // kept the old number (build 86 said "11 count" for a list of 95).
  // Read only then, not on every tap of a stepper: asking the phone how many
  // are picked takes a moment, and the screen caught on each tap (build 127).
  const [countedValue, setCountedValue] = useState(essentialsNow);
  useFocusEffect(useCallback(() => setCountedValue(essentialsNow()), []));
  // Pretend use is for trying the app without real screen time; once that is on, it would only confuse.
  const pretend = DEV_TOOLS && !isOn();
  // On a narrow phone the goal's figures give the two round buttons room.
  const narrow = Math.min(useWindowDimensions().width, 480) < 360;
  // An empty battery locks these (the Screen Time card says why); they look it, instead of ignoring taps.
  const locked = settingsLocked();
  const proState = usePro();
  const isPro = proState.isPro;
  const proValue = isPro ? 'Unlocked' : (proState.price ?? (proState.storeOpen ? 'See what it adds' : EXPECTED_PRICE));
  // A higher goal starts at the next recharge; today keeps its own (goal.ts). The stepper shows the one chosen.
  const chosen = chosenGoal(settings);
  const waiting = chosen !== settings.goalMinutes;
  // When the next battery starts: the recharge, or a little later when a new recharge time is waiting (recharge.ts).
  const recharge = clockLabelOf(batteryEnd(day, settings));
  // On setup's own day every change starts at once (goal.ts); the note says so, and what happens after.
  const firstDay = goalFree(useDoc());

  return (
    <Page top={24} bottom={24}>
      <Title>Settings</Title>

      {/* Only when it has something to say: counting is off, or the battery is empty and these are locked. */}
      <ScreenTimeCard />

      <Card style={{ paddingTop: 16, paddingBottom: 18, gap: 10 }}>
        <Label>Daily goal</Label>
        <View style={styles.stepper}>
          <StepButton sign="−" label="Less time" size={narrow ? 46 : 52} disabled={!store.canStepGoal(-1)} onPress={() => store.stepGoal(-1)} />
          <Text accessibilityLabel={`Daily goal, ${durationLabel(chosen)}${waiting ? `, from ${recharge}` : ''}`} style={[styles.goal, { color: accent }, narrow ? { fontSize: 50, lineHeight: 54, letterSpacing: -1.6 } : null]}>
            {durationLabel(chosen)}
          </Text>
          <StepButton sign="+" label="More time" size={narrow ? 46 : 52} disabled={!store.canStepGoal(1)} onPress={() => store.stepGoal(1)} />
        </View>
        {/* The battery's six cells, and how long each lasts at this goal. */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.cells}>
            {Array.from({ length: CELLS }, (_, i) => (
              <View key={i} style={[styles.cell, { backgroundColor: accent }]} />
            ))}
          </View>
          <Text style={styles.cellNote}>6 cells of {cellWords(chosen)}</Text>
        </View>
        {waiting ? (
          // Today and the next recharge side by side, so it reads at a glance why Today still shows the old goal.
          <View style={styles.waiting} accessible accessibilityLabel={`Today stays at ${durationLabel(settings.goalMinutes)}. ${durationLabel(chosen)} starts at ${recharge}.`}>
            <View style={styles.waitPart}>
              <Text style={styles.waitLabel}>Today</Text>
              <Text style={styles.waitValue}>{durationLabel(settings.goalMinutes)}</Text>
            </View>
            <Text style={styles.waitArrow}>→</Text>
            <View style={styles.waitPart}>
              <Text style={styles.waitLabel}>From {recharge}</Text>
              <Text style={[styles.waitValue, { color: accent }]}>{durationLabel(chosen)}</Text>
            </View>
          </View>
        ) : null}
        {firstDay ? (
          <View style={styles.firstDay}>
            <Text style={styles.firstDayTitle}>Your first day: changes start now</Text>
            <Text style={styles.firstDayLine}>From tomorrow, more time waits for the {recharge} recharge. Less time always starts right away.</Text>
          </View>
        ) : null}
      </Card>

      {/* What an empty battery does: three pictures to tap, and one line on the chosen one. */}
      <Card style={{ paddingTop: 14, paddingBottom: 14, gap: 10 }}>
        <Label>When the battery is empty</Label>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
          {EMPTY_CHOICES.map(({ level, title, icon }) => {
            const chosen = settings.emptyLevel === level;
            return (
              <Pressable
                key={level}
                accessibilityRole="radio"
                accessibilityLabel={`${title}, ${emptyLine(level, first.minutes)}`}
                accessibilityState={{ checked: chosen, disabled: locked }}
                aria-checked={chosen}
                disabled={locked}
                onPress={() => {
                  tap();
                  store.setEmptyLevel(level);
                }}
                style={({ pressed }) => [styles.mode, chosen ? { borderColor: accent, borderWidth: 2, backgroundColor: 'rgba(244,245,242,0.06)' } : null, locked ? { opacity: 0.6 } : null, pressed ? { opacity: 0.8 } : null]}>
                <View style={[styles.modeDot, chosen ? { backgroundColor: accent } : null]}>
                  <Icon name={icon} size={23} color={chosen ? c.onTone : c.ink2} />
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.modeName, chosen ? { color: c.ink } : null]}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.modeLine}>{emptyLine(settings.emptyLevel, first.minutes)}</Text>
      </Card>

      {/* Essentials: example tiles (the phone never says which apps were picked), and how many there are. */}
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Essentials, ${countedValue}`}
          onPress={() => {
            tap();
            router.push('/what-counts');
          }}
          style={({ pressed }) => [styles.essentials, pressed ? { opacity: 0.7 } : null]}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.rowLabel}>Essentials</Text>
            <Text numberOfLines={1} style={styles.proLine}>
              {countedValue}, always free
            </Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ flexDirection: 'row', gap: 5 }}>
            <IconTile icon={{ name: 'phone', bg: '#34C759' }} size={30} />
            <IconTile icon={{ name: 'message', bg: '#34C759' }} size={30} />
            <IconTile icon={{ name: 'map', bg: '#3B82F6' }} size={30} />
          </View>
          <Chevron />
        </Pressable>
      </Card>

      <Card>
        <LinkRow icon={{ name: 'advanced', bg: tiles.gray }} label="Advanced" onPress={() => router.push('/advanced')} />
        <LinkRow icon={{ name: 'widget', bg: tiles.blue }} label="Add the widget" onPress={() => router.push('/widget')} />
        <LinkRow icon={{ name: 'tips', bg: tiles.yellow }} label="Use your phone less" value={`${TIPS.length} tips`} onPress={() => router.push('/tips')} last />
      </Card>

      {/* Pro has its own gold row, last: seen, never in the way. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Plainlimit Pro, ${proValue}`}
        onPress={() => {
          tap();
          router.push('/pro');
        }}
        style={({ pressed }) => [styles.pro, pressed ? { opacity: 0.8 } : null]}>
        <IconTile icon={{ name: 'pro', bg: '#F2C656', fg: c.onPaper }} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.rowLabel}>Plainlimit Pro</Text>
          <Text style={styles.proLine}>{isPro ? 'Thank you' : 'Pay once, yours for good'}</Text>
        </View>
        <Text style={styles.proValue}>{proValue}</Text>
        <Chevron />
      </Pressable>

      {DEV_TOOLS ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Label>Developer: Pro</Label>
          {/* A phone that has bought Pro can try the free app, and one that hasn't can try Pro. */}
          {proState.owned ? (
            <>
              <Text style={styles.note}>{proState.pretendFree ? 'Pro is bought, but the app is acting as the free version.' : 'Pro is bought.'} None of this is in the App Store version.</Text>
              <BigButton quiet label={proState.pretendFree ? 'Back to Pro' : 'Act as the free version'} onPress={() => pro.setPretendFree(!proState.pretendFree)} />
            </>
          ) : (
            <>
              <Text style={styles.note}>{proState.pretend ? 'Pretending Pro is bought.' : 'Pro is not bought.'} None of this is in the App Store version.</Text>
              <BigButton quiet label={proState.pretend ? 'Stop pretending Pro' : 'Pretend Pro is bought'} onPress={() => pro.setPretend(!proState.pretend)} />
            </>
          )}
        </View>
      ) : null}

      {pretend ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Label>Developer</Label>
          <Text style={styles.note}>
            Pretend use, for trying the app without real screen time. {durationLabel(day.usedMinutes)} used so far. None of this is in the App Store version.
          </Text>
          <BigButton quiet label="Use 10 more minutes" onPress={() => store.pretendUse(10)} />
          <BigButton quiet label="Use 30 more minutes" onPress={() => store.pretendUse(30)} />
          <BigButton quiet label="Recharge now" onPress={() => store.rechargeNow()} />
          <BigButton quiet label="Fill the last week" onPress={() => store.pretendWeek()} />
          <BigButton quiet label="See the warning screen" onPress={() => router.push('/screens/warning')} />
          <BigButton quiet label="See the empty screen" onPress={() => router.push('/screens/empty')} />
        </View>
      ) : null}

      <TestBuildTools />
    </Page>
  );
}

/** The three things an empty battery can do, each with its picture. */
const EMPTY_CHOICES: readonly { level: EmptyLevel; title: string; icon: IconName }[] = [
  { level: 'warn', title: 'Warn', icon: 'warn' },
  { level: 'work', title: 'Work for it', icon: 'sums' },
  { level: 'locked', title: 'Locked', icon: 'lock' },
];

/** One line on what a choice does. */
function emptyLine(level: EmptyLevel, minutes: number): string {
  if (level === 'warn') return 'Red screen, then tap through';
  if (level === 'work') return `Solve sums to get ${minutes} more minutes`;
  return 'Counted apps stay locked until it recharges';
}

/** The Essentials row's value: how many are picked, as the phone has it now. */
function essentialsNow(): string {
  const picked = SCREEN_TIME_AVAILABLE || MOCK_PHONE ? pickCount(COUNTED_ID) : -1;
  return essentialsValue(picked, essentialsMode() ? essentialsCount() : null);
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goal: { fontFamily: display.bold, fontSize: 64, lineHeight: 66, letterSpacing: -2.4, color: c.ink },
  cells: { flexDirection: 'row', gap: 6 },
  cell: { width: 30, height: 13, borderRadius: 5 },
  cellNote: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(244,245,242,0.07)' },
  waitPart: { flex: 1, gap: 2 },
  waitLabel: { fontSize: 13, lineHeight: 17, color: c.ink3 },
  waitValue: { fontFamily: display.semi, fontSize: 20, lineHeight: 24, color: c.ink },
  waitArrow: { fontSize: 18, color: c.ink3 },
  firstDay: { gap: 3, marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(244,245,242,0.07)' },
  firstDayTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  firstDayLine: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  mode: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, alignItems: 'center', gap: 7 },
  modeDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
  modeName: { fontSize: 14.5, lineHeight: 18, fontWeight: '600', color: c.ink2 },
  modeLine: { fontSize: 14, lineHeight: 19, color: c.ink3, textAlign: 'center' },
  essentials: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  pro: { minHeight: 64, borderRadius: 22, borderWidth: 1, borderColor: '#5B4A1C', backgroundColor: '#1F1C13', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  proLine: { fontSize: 13.5, lineHeight: 18, color: c.ink3 },
  proValue: { fontFamily: display.semi, fontSize: 16, color: '#F2C656' },
});
