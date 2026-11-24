import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { sumLevelFor } from '@/domain/pro';
import type { SumLevel } from '@/domain/puzzle';
import { usePro } from '@/pro/pro';
import { settingsLocked, store } from '@/state/store';
import { Card, Label, Lead, Page, Pills, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Do more > Sums: how hard the sums are, with one of the sums the
// chosen level gives. Normal is free; easy and hard are Pro. Up to build 137
// this was a card on the Advanced page, which the owner had taken apart
// (2026-11-22: the extras were "kind of hidden" there).

export default function Sums() {
  // Drawn afresh each time: it asks the phone whether the settings are locked.
  'use no memo';
  const router = useRouter();
  const { settings, accent } = useDay();
  const isPro = usePro().isPro;
  const locked = settingsLocked();
  const level = sumLevelFor(settings, isPro);
  // Easy and hard sums are Pro: without it, choosing one shows what Pro adds.
  const choose = (next: SumLevel) => (next === 'normal' || isPro ? store.setSumLevel(next) : router.push('/pro?show=sums'));

  return (
    <Page header top={8}>
      <Title>Sums</Title>
      <Lead>The sums you solve to earn more time, or to open an app on Second thought.</Lead>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 14, opacity: locked ? 0.6 : 1 }}>
        <Label>How hard</Label>
        {/* One sum of the chosen level, as it looks on the sums screen. */}
        <View accessible accessibilityLabel={`Like ${SUM_LIKE[level]}`} style={styles.sample}>
          <Text style={[styles.sum, { color: accent }]}>{SUM_LIKE[level]}</Text>
        </View>
        <Pills options={[{ value: 'easy', label: 'Easy', pro: !isPro }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard', pro: !isPro }]} chosen={level} accent={accent} onChange={(next) => (locked ? undefined : choose(next))} />
        {locked ? <Text style={styles.note}>The battery is empty, so this is locked until it recharges.</Text> : null}
      </Card>
    </Page>
  );
}

/** One sum of each level, as on the sums screen. */
const SUM_LIKE: Record<SumLevel, string> = { easy: '47 + 8', normal: '47 + 38', hard: '347 + 86' };

const styles = StyleSheet.create({
  sample: { alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: c.ground, borderWidth: 1.5, borderColor: c.rule },
  sum: { fontFamily: display.bold, fontSize: 44, lineHeight: 48, letterSpacing: -1.2 },
  note: { fontSize: 14, lineHeight: 19, color: c.ink3 },
});
