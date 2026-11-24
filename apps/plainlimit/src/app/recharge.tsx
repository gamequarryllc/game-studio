import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { clockLabel, clockLabelOf } from '@/domain/day';
import { goalFree } from '@/domain/goal';
import { batteryEnd, chosenRecharge } from '@/domain/recharge';
import { usePro } from '@/pro/pro';
import { settingsLocked, store, useDoc } from '@/state/store';
import { BigButton, Card, Label, Lead, Page, StepButton, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Do more > Recharge time: when the battery refills each day.
// Choosing the time is Pro; a time chosen before Pro (1.0) stays as it was.
// Without Pro the tile in Settings opens the Pro screen instead of this one;
// reached anyway, this shows the time and the way to Pro, with no stepper.
// Up to build 137 this was a row on the Advanced page (see sums.tsx).

export default function Recharge() {
  // Drawn afresh each time: it asks the phone whether the settings are locked.
  'use no memo';
  const router = useRouter();
  const { settings, day, accent } = useDay();
  const isPro = usePro().isPro;
  const locked = settingsLocked();
  // When the next battery starts: the recharge, or a little later when a new recharge time is waiting (recharge.ts).
  const recharge = clockLabelOf(batteryEnd(day, settings));
  // A new recharge time waits for this battery to end; the stepper shows the one chosen.
  const chosenTime = clockLabel(chosenRecharge(settings));
  const timeWaiting = chosenRecharge(settings) !== settings.rechargeMinute;
  // On setup's own day every change starts at once (goal.ts).
  const firstDay = goalFree(useDoc());
  // On a narrow phone the time gives the two round buttons room.
  const narrow = Math.min(useWindowDimensions().width, 480) < 360;

  return (
    <Page header top={8}>
      <Title>Recharge time</Title>
      <Lead>The time the battery refills each day. A morning time means no fresh battery for a late-night scroll.</Lead>

      <Card style={{ paddingTop: 16, paddingBottom: 18, gap: 10 }}>
        <Label>Recharges at</Label>
        <View style={styles.stepper}>
          {isPro ? <StepButton sign="−" label="Recharge earlier" size={narrow ? 46 : 52} disabled={locked} onPress={() => store.stepRecharge(-1)} /> : null}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Recharges at ${chosenTime}${timeWaiting ? ', after this battery' : ''}`}
            style={[styles.time, { color: timeWaiting ? accent : c.ink }, narrow ? { fontSize: 36, lineHeight: 42 } : null]}>
            {chosenTime}
          </Text>
          {isPro ? <StepButton sign="+" label="Recharge later" size={narrow ? 46 : 52} disabled={locked} onPress={() => store.stepRecharge(1)} /> : null}
        </View>
        {timeWaiting ? (
          // Later: this battery runs on to the new time. Earlier: one more recharge as planned, counted from the new time.
          <Text style={styles.note}>{recharge === chosenTime ? `This battery runs on until ${chosenTime}.` : `One more recharge at ${recharge}, then at ${chosenTime}.`}</Text>
        ) : null}
        {isPro && firstDay ? <Text style={styles.note}>Your first day, so this changes now. From tomorrow, a new time waits for the battery to end.</Text> : null}
        {isPro && locked ? <Text style={styles.note}>The battery is empty, so this is locked until it recharges.</Text> : null}
        {isPro ? null : <Text style={styles.note}>Choosing the time is part of Plainlimit Pro.</Text>}
      </Card>

      {isPro ? null : <BigButton label="See Plainlimit Pro" onPress={() => router.push('/pro?show=recharge')} />}
    </Page>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  time: { flex: 1, textAlign: 'center', fontFamily: display.bold, fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  note: { fontSize: 14, lineHeight: 19, color: c.ink3, textAlign: 'center' },
});
