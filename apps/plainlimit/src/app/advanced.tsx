import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { clockLabel, clockLabelOf } from '@/domain/day';
import { goalFree } from '@/domain/goal';
import { batteryEnd, chosenRecharge } from '@/domain/recharge';
import { ASK_ID, DEFAULT_ASK_FIRST, askShownOn, openShort } from '@/domain/askFirst';
import { sumLevelFor } from '@/domain/pro';
import type { SumLevel } from '@/domain/puzzle';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { usePro } from '@/pro/pro';
import { settingsLocked, store, useDoc } from '@/state/store';
import { Card, IconTile, LinkRow, Page, Pills, StepButton, Title, tiles, type RowIcon } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Advanced: the extras, kept off the main screens so the app stays
// simple (the owner, 2026-11-17). Easy and hard sums are Pro.

export default function Advanced() {
  // Drawn afresh each time: it asks the phone things as it draws (are the settings locked, is counting on).
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
  const ask = settings.askFirst ?? DEFAULT_ASK_FIRST;
  // On only with apps picked, as on the Second thought screen's switch.
  const askValue = askShownOn(ask, pickCount(ASK_ID), SCREEN_TIME_AVAILABLE || MOCK_PHONE) ? `On, ${openShort(ask)}` : 'Off';
  const level = sumLevelFor(settings, isPro);
  // Easy and hard sums are Pro: without it, choosing one shows what Pro adds.
  const choose = (next: SumLevel) => (next === 'normal' || isPro ? store.setSumLevel(next) : router.push('/pro'));

  return (
    <Page top={8}>
      <Title>Advanced</Title>

      {/* When the battery recharges. Choosing the time is Pro; a time chosen before Pro (1.0) stays as it was. */}
      <Card>
        {isPro ? (
          <View style={styles.rechargeRow}>
            <IconTile icon={RECHARGE_ICON} />
            <Text style={styles.rowLabel}>Recharges at</Text>
            {/* On a narrow phone the stepper drops to its own line, still on the right. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <StepButton sign="−" label="Recharge earlier" size={38} disabled={locked} onPress={() => store.stepRecharge(-1)} />
              <Text accessibilityLabel={`Recharges at ${chosenTime}${timeWaiting ? ', after this battery' : ''}`} style={[styles.rechargeValue, timeWaiting ? { color: accent } : null]}>
                {chosenTime}
              </Text>
              <StepButton sign="+" label="Recharge later" size={38} disabled={locked} onPress={() => store.stepRecharge(1)} />
            </View>
            {timeWaiting ? (
              // Later: this battery runs on to the new time. Earlier: one more recharge as planned, counted from the new time.
              <Text style={styles.rechargeNote}>{recharge === chosenTime ? `This battery runs on until ${chosenTime}.` : `One more recharge at ${recharge}, then at ${chosenTime}.`}</Text>
            ) : null}
            {firstDay ? <Text style={styles.rechargeNote}>Your first day, so this changes now. From tomorrow, a new time waits for the battery to end.</Text> : null}
          </View>
        ) : (
          <LinkRow icon={RECHARGE_ICON} label="Recharges at" value={chosenTime} pro onPress={() => router.push('/pro')} last />
        )}
      </Card>

      <Card>
        <LinkRow icon={{ name: 'secondThought', bg: tiles.purple }} label="Second thought" value={askValue} onPress={() => router.push('/ask-first')} />
        <LinkRow icon={{ name: 'lockMessage', bg: tiles.teal }} label="Lock message" value={settings.lockMessage ? 'On' : 'Off'} onPress={() => router.push('/lock-message')} last />
      </Card>

      {/* Sums: three buttons, with one of the sums the chosen level gives. Easy and hard are Pro. */}
      <Card style={{ paddingTop: 12, paddingBottom: 16, gap: 12, opacity: locked ? 0.6 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon={{ name: 'sums', bg: tiles.pink }} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '500', color: c.ink }}>Sums</Text>
          <Text accessibilityLabel={`Like ${SUM_LIKE[level]}`} style={{ fontFamily: display.semi, fontSize: 16, color: c.ink3 }}>
            {SUM_LIKE[level]}
          </Text>
        </View>
        <Pills options={[{ value: 'easy', label: 'Easy', pro: !isPro }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard', pro: !isPro }]} chosen={level} accent={accent} onChange={(next) => (locked ? undefined : choose(next))} />
      </Card>
    </Page>
  );
}

const RECHARGE_ICON: RowIcon = { name: 'recharge', bg: tiles.orange };

/** One sum of each level, as on the sums screen. */
const SUM_LIKE: Record<SumLevel, string> = { easy: '47 + 8', normal: '47 + 38', hard: '347 + 86' };

const styles = StyleSheet.create({
  rechargeRow: { minHeight: 54, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rechargeValue: { fontFamily: display.semi, fontSize: 17, color: c.ink, minWidth: 78, textAlign: 'center' },
  rechargeNote: { flexBasis: '100%', fontSize: 14, lineHeight: 19, color: c.ink3 },
});
