import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { clockLabel, durationLabel } from '@/domain/day';
import { topUpPlan } from '@/domain/puzzle';
import type { CountMode } from '@/domain/types';
import { ALLOWED_ID, DEV_TOOLS, SCREEN_TIME_AVAILABLE, isOn, pickCount } from '@/platform/screenTime';
import { store } from '@/state/store';
import { BigButton, Card, Choice, Label, LinkRow, Page, StepButton, Title } from '@/ui/kit';
import { Battery } from '@/ui/Battery';
import { ScreenTimeCard } from '@/ui/ScreenTimeCard';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

const COUNT_NAMES: Record<CountMode, string> = { everything: 'Everything', timeWasters: 'Time-wasters', custom: 'Your own picks' };

/** "30 minutes", "17 and a half minutes", "1 hour". */
function cellWords(goalMinutes: number): string {
  const each = goalMinutes / 6;
  if (each === 60) return '1 hour';
  if (each > 60) return `${durationLabel(each)}`;
  const whole = Math.floor(each);
  if (each === whole) return `${whole} minutes`;
  return `${whole} and a half minutes`;
}

export default function Settings() {
  const router = useRouter();
  const { settings, day, cells, accent } = useDay();
  const first = topUpPlan(0);
  // On a real iPhone the always-allowed apps are picked in Apple's list, and only their number is known.
  const allowedCount = SCREEN_TIME_AVAILABLE ? pickCount(ALLOWED_ID) : settings.allowed.length;
  const allowedValue = SCREEN_TIME_AVAILABLE ? (allowedCount === 0 ? 'None' : `${allowedCount} picked`) : allowedCount === 1 ? '1 app' : `${allowedCount} apps`;
  // Pretend use is for trying the app without real screen time; once that is on, it would only confuse.
  const pretend = DEV_TOOLS && !isOn();
  // On a narrow phone the goal's figures give the two round buttons room.
  const narrow = Math.min(useWindowDimensions().width, 480) < 360;

  return (
    <Page top={24} bottom={24}>
      <Title>Settings</Title>

      <ScreenTimeCard />

      <Card style={{ paddingTop: 16, paddingBottom: 18, gap: 10 }}>
        <Label>Daily goal</Label>
        <View style={styles.stepper}>
          <StepButton sign="−" label="Less time" size={narrow ? 46 : 52} onPress={() => store.stepGoal(-1)} />
          <Text accessibilityLabel={`Daily goal, ${durationLabel(settings.goalMinutes)}`} style={[styles.goal, { color: accent }, narrow ? { fontSize: 50, lineHeight: 54, letterSpacing: -1.6 } : null]}>
            {durationLabel(settings.goalMinutes)}
          </Text>
          <StepButton sign="+" label="More time" size={narrow ? 46 : 52} onPress={() => store.stepGoal(1)} />
        </View>
        <View style={styles.cellRow}>
          <View style={{ width: 74 }}>
            <Battery cells={cells} tone={{ fg: c.ink, track: 'rgba(244,245,242,0.22)', bg: c.card }} height={26} flat decorative />
          </View>
          <Text style={styles.cellNote}>Six cells of {cellWords(settings.goalMinutes)} each</Text>
        </View>
      </Card>

      <Card>
        <View style={[styles.rechargeRow, { borderBottomWidth: 1, borderBottomColor: c.rule }]}>
          <Text style={styles.rowLabel}>Recharges at</Text>
          {/* On a narrow phone the stepper drops to its own line, still on the right. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <StepButton sign="−" label="Recharge earlier" size={40} onPress={() => store.stepRecharge(-1)} />
            <Text accessibilityLabel={`Recharges at ${clockLabel(settings.rechargeMinute)}`} style={styles.rechargeValue}>
              {clockLabel(settings.rechargeMinute)}
            </Text>
            <StepButton sign="+" label="Recharge later" size={40} onPress={() => store.stepRecharge(1)} />
          </View>
        </View>
        <LinkRow label="What counts" value={COUNT_NAMES[settings.countMode]} onPress={() => router.push('/what-counts')} />
        <LinkRow label="Always allowed" value={allowedValue} onPress={() => router.push('/allowed')} last />
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>When the battery is empty</Label>
        <Choice title="Warn" line="Red screen, then tap through" chosen={settings.emptyLevel === 'warn'} accent={accent} onPress={() => store.setEmptyLevel('warn')} />
        <Choice title="Work for it" line={`Solve sums to get ${first.minutes} more minutes`} chosen={settings.emptyLevel === 'work'} accent={accent} onPress={() => store.setEmptyLevel('work')} />
        <Choice title="Locked" line="Nothing opens until it recharges" chosen={settings.emptyLevel === 'locked'} accent={accent} onPress={() => store.setEmptyLevel('locked')} />
      </Card>

      {pretend ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Label>Developer</Label>
          <Text style={styles.note}>
            Pretend use, for trying the app without real screen time. {durationLabel(day.usedMinutes)} used so far. None of this is in the App Store version.
          </Text>
          <BigButton quiet label="Use 10 more minutes" onPress={() => store.pretendUse(10)} />
          <BigButton quiet label="Use 30 more minutes" onPress={() => store.pretendUse(30)} />
          <BigButton quiet label="Recharge now" onPress={() => store.rechargeNow()} />
          <BigButton quiet label="See the warning screen" onPress={() => router.push('/screens/warning')} />
          <BigButton quiet label="See the empty screen" onPress={() => router.push('/screens/empty')} />
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goal: { fontFamily: display.bold, fontSize: 64, lineHeight: 66, letterSpacing: -2.4, color: c.ink },
  cellRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  cellNote: { flex: 1, fontSize: 14, lineHeight: 19, color: c.ink3 },
  rechargeRow: { minHeight: 60, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rechargeValue: { fontFamily: display.semi, fontSize: 17, color: c.ink, minWidth: 84, textAlign: 'center' },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
