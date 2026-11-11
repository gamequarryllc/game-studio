import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { clockLabel, durationLabel } from '@/domain/day';
import { topUpPlan } from '@/domain/puzzle';
import type { CountMode } from '@/domain/types';
import { DEV_TOOLS } from '@/platform/screenTime';
import { store, useDoc, useNow } from '@/state/store';
import { BigButton, Card, Choice, Label, LinkRow, Page, StepButton, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';

const COUNT_NAMES: Record<CountMode, string> = { everything: 'Everything', timeWasters: 'Time-wasters', custom: 'Your own picks' };

export default function Settings() {
  const router = useRouter();
  useNow();
  const { settings, day } = useDoc();
  const first = topUpPlan(0);

  return (
    <Page top={24} bottom={24}>
      <Title>Settings</Title>

      <Card style={{ paddingVertical: 14, gap: 6 }}>
        <Label>Daily goal</Label>
        <View style={styles.stepper}>
          <StepButton sign="−" label="Less time" onPress={() => store.stepGoal(-1)} />
          <Text accessibilityLabel={`Daily goal, ${durationLabel(settings.goalMinutes)}`} style={styles.goal}>
            {durationLabel(settings.goalMinutes)}
          </Text>
          <StepButton sign="+" label="More time" onPress={() => store.stepGoal(1)} />
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
        <LinkRow label="Always allowed" value={settings.allowed.length === 1 ? '1 app' : `${settings.allowed.length} apps`} onPress={() => router.push('/allowed')} last />
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>When the battery is empty</Label>
        <Choice title="Warn" line="Red screen, then tap through" chosen={settings.emptyLevel === 'warn'} onPress={() => store.setEmptyLevel('warn')} />
        <Choice title="Work for it" line={`Solve sums to get ${first.minutes} more minutes`} chosen={settings.emptyLevel === 'work'} onPress={() => store.setEmptyLevel('work')} />
        <Choice title="Locked" line="Nothing opens until it recharges" chosen={settings.emptyLevel === 'locked'} onPress={() => store.setEmptyLevel('locked')} />
      </Card>

      {DEV_TOOLS ? (
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
  goal: { fontFamily: display.bold, fontSize: 52, lineHeight: 58, letterSpacing: -1, color: c.ink },
  rechargeRow: { minHeight: 60, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rechargeValue: { fontFamily: display.semi, fontSize: 17, color: c.ink, minWidth: 84, textAlign: 'center' },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
