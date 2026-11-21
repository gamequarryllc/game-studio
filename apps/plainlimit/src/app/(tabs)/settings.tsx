import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { CELLS, cellWords } from '@/domain/battery';
import { clockLabel, clockLabelOf, durationLabel } from '@/domain/day';
import { chosenGoal, goalFree } from '@/domain/goal';
import { batteryEnd, chosenRecharge } from '@/domain/recharge';
import { topUpPlan } from '@/domain/puzzle';
import { EXPECTED_PRICE } from '@/pro/config';
import { pro, usePro } from '@/pro/pro';
import { COUNTED_ID, DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, essentialsCount, essentialsMode, isOn, pickCount } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { BigButton, Card, Choice, Label, LinkRow, Page, StepButton, Title } from '@/ui/kit';
import { essentialsValue } from '@/ui/countWords';
import { TIPS } from '@/ui/tips';
import { Battery } from '@/ui/Battery';
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
  // A new recharge time waits for this battery to end; the stepper shows the one chosen.
  const chosenTime = clockLabel(chosenRecharge(settings));
  const timeWaiting = chosenRecharge(settings) !== settings.rechargeMinute;
  // On setup's own day every change starts at once (goal.ts); the note says so, and what happens after.
  const firstDay = goalFree(useDoc());

  return (
    <Page top={24} bottom={24}>
      <Title>Settings</Title>

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
        <View style={styles.cellRow}>
          <View style={{ width: 74 }}>
            <Battery cells={CELLS} tone={{ fg: c.ink, track: 'rgba(244,245,242,0.22)', bg: c.card }} height={26} flat decorative />
          </View>
          <Text style={styles.cellNote}>Six cells of {cellWords(chosen)} each</Text>
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
            <Text style={styles.firstDayLine}>From tomorrow, more time waits for the {chosenTime} recharge. Less time always starts right away.</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        {isPro ? (
          <View style={[styles.rechargeRow, { borderBottomWidth: 1, borderBottomColor: c.rule }]}>
          <Text style={styles.rowLabel}>Recharges at</Text>
          {/* On a narrow phone the stepper drops to its own line, still on the right. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <StepButton sign="−" label="Recharge earlier" size={40} disabled={locked} onPress={() => store.stepRecharge(-1)} />
            <Text accessibilityLabel={`Recharges at ${chosenTime}${timeWaiting ? ', after this battery' : ''}`} style={[styles.rechargeValue, timeWaiting ? { color: accent } : null]}>
              {chosenTime}
            </Text>
            <StepButton sign="+" label="Recharge later" size={40} disabled={locked} onPress={() => store.stepRecharge(1)} />
          </View>
          {timeWaiting ? (
            // Later: this battery runs on to the new time. Earlier: one more recharge as planned, counted from the new time.
            <Text style={styles.rechargeNote}>{recharge === chosenTime ? `This battery runs on until ${chosenTime}.` : `One more recharge at ${recharge}, then at ${chosenTime}.`}</Text>
          ) : null}
          {firstDay ? <Text style={styles.rechargeNote}>Your first day, so this changes now. From tomorrow, a new time waits for the battery to end.</Text> : null}
        </View>
        ) : (
          // Changing the recharge time is Pro. A time chosen before Pro (1.0) stays as it was.
          <LinkRow label="Recharges at" value={`${chosenTime} · Pro`} onPress={() => router.push('/pro')} />
        )}
        <LinkRow label="Essentials" value={countedValue} onPress={() => router.push('/what-counts')} last />
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>When the battery is empty</Label>
        <Choice title="Warn" line="Red screen, then tap through" chosen={settings.emptyLevel === 'warn'} disabled={locked} accent={accent} onPress={() => store.setEmptyLevel('warn')} />
        <Choice title="Work for it" line={`Solve sums to get ${first.minutes} more minutes`} chosen={settings.emptyLevel === 'work'} disabled={locked} accent={accent} onPress={() => store.setEmptyLevel('work')} />
        <Choice title="Locked" line="Counted apps stay locked until it recharges" chosen={settings.emptyLevel === 'locked'} disabled={locked} accent={accent} onPress={() => store.setEmptyLevel('locked')} />
      </Card>

      <Card>
        <LinkRow label="Advanced" value="Second thought, more" onPress={() => router.push('/advanced')} />
        <LinkRow label="Plainlimit Pro" value={proValue} onPress={() => router.push('/pro')} />
        <LinkRow label="Use your phone less" value={`${TIPS.length} tips`} onPress={() => router.push('/tips')} last />
      </Card>

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

/** The Essentials row's value: how many are picked, as the phone has it now. */
function essentialsNow(): string {
  const picked = SCREEN_TIME_AVAILABLE || MOCK_PHONE ? pickCount(COUNTED_ID) : -1;
  return essentialsValue(picked, essentialsMode() ? essentialsCount() : null);
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goal: { fontFamily: display.bold, fontSize: 64, lineHeight: 66, letterSpacing: -2.4, color: c.ink },
  cellRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  cellNote: { flex: 1, fontSize: 14, lineHeight: 19, color: c.ink3 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(244,245,242,0.07)' },
  waitPart: { flex: 1, gap: 2 },
  waitLabel: { fontSize: 13, lineHeight: 17, color: c.ink3 },
  waitValue: { fontFamily: display.semi, fontSize: 20, lineHeight: 24, color: c.ink },
  waitArrow: { fontSize: 18, color: c.ink3 },
  firstDay: { gap: 3, marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(244,245,242,0.07)' },
  firstDayTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  firstDayLine: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  rechargeRow: { minHeight: 60, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rechargeValue: { fontFamily: display.semi, fontSize: 17, color: c.ink, minWidth: 84, textAlign: 'center' },
  rechargeNote: { flexBasis: '100%', fontSize: 14, lineHeight: 19, color: c.ink3 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
