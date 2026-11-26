import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countWords, earnStep, earnWithOf } from '@/domain/earn';
import { sumLevelFor } from '@/domain/pro';
import type { SumLevel } from '@/domain/puzzle';
import type { EarnWith } from '@/domain/pushUps';
import { tap } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { settingsLocked, store } from '@/state/store';
import { FloorPicture } from '@/ui/FloorPicture';
import { Icon, type IconName } from '@/ui/icons';
import { BigButton, Card, Label, Lead, Page, Pills, ProBadge, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Do more > Earn time: what more time costs once the battery is
// empty. Sums are free and the default; push-ups, counted by the front camera,
// are Pro (the owner, 2026-11-26). How hard the sums are: normal is free, easy
// and hard are Pro, and Second thought always asks for one of them. Up to
// build 137 the sums were a card on the Advanced page, which the owner had
// taken apart (2026-11-22: the extras were "kind of hidden" there).

export default function EarnTime() {
  // Drawn afresh each time: it asks the phone whether the settings are locked.
  'use no memo';
  const router = useRouter();
  const { settings, accent } = useDay();
  const isPro = usePro().isPro;
  const locked = settingsLocked();
  const level = sumLevelFor(settings, isPro);
  const earnWith = earnWithOf(settings);
  // Easy and hard sums, and push-ups, are Pro: without it, choosing one shows what Pro adds.
  const chooseLevel = (next: SumLevel) => (next === 'normal' || isPro ? store.setSumLevel(next) : router.push('/pro?show=sums'));
  const chooseEarn = (next: EarnWith) => (next === 'sums' || isPro ? store.setEarnWith(next) : router.push('/pro?show=pushUps'));
  const plan = [0, 1, 2].map((n) => earnStep('pushUps', n));

  return (
    <Page header top={8}>
      <Title>Earn time</Title>
      <Lead>What you do for more minutes once the battery is empty.</Lead>

      <Card style={{ paddingTop: 14, paddingBottom: 14, gap: 10, opacity: locked ? 0.6 : 1 }}>
        <Label>Earn it with</Label>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
          {EARN_CHOICES.map(({ value, title, icon }) => {
            const chosen = earnWith === value;
            const needsPro = value === 'pushUps' && !isPro;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={`${title}${needsPro ? ', Pro' : ''}`}
                accessibilityState={{ checked: chosen, disabled: locked }}
                aria-checked={chosen}
                disabled={locked}
                onPress={() => {
                  tap();
                  chooseEarn(value);
                }}
                style={({ pressed }) => [styles.choice, chosen ? { borderColor: accent, borderWidth: 2, backgroundColor: 'rgba(244,245,242,0.06)' } : null, pressed ? { opacity: 0.8 } : null]}>
                <View style={[styles.dot, chosen ? { backgroundColor: accent } : null]}>
                  <Icon name={icon} size={23} color={chosen ? c.onTone : c.ink2} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={[styles.choiceName, chosen ? { color: c.ink } : null]}>
                    {title}
                  </Text>
                  {needsPro ? <ProBadge /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {earnWith === 'pushUps' ? (
          <View style={{ gap: 12, marginTop: 4 }}>
            <FloorPicture accent={accent} k={0.9} />
            <Text style={styles.line}>Lay your phone flat on the floor under your face, screen up. The front camera counts each push-up. The picture stays on your iPhone and is never saved or sent.</Text>
            <Text style={styles.note}>
              {countWords(plan[0])} for {plan[0].minutes} minutes, then {plan[1].count} for {plan[1].minutes}, then {plan[2].count} for {plan[2].minutes}.
            </Text>
            <BigButton quiet label="Try it now" onPress={() => router.push('/puzzle?try=1')} />
          </View>
        ) : null}
        {locked ? <Text style={styles.note}>The battery is empty, so this is locked until it recharges.</Text> : null}
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 14, opacity: locked ? 0.6 : 1 }}>
        <Label>How hard the sums are</Label>
        {/* One sum of the chosen level, as it looks on the sums screen. */}
        <View accessible accessibilityLabel={`Like ${SUM_LIKE[level]}`} style={styles.sample}>
          <Text style={[styles.sum, { color: accent }]}>{SUM_LIKE[level]}</Text>
        </View>
        <Pills options={[{ value: 'easy', label: 'Easy', pro: !isPro }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard', pro: !isPro }]} chosen={level} accent={accent} onChange={(next) => (locked ? undefined : chooseLevel(next))} />
        <Text style={styles.note}>{earnWith === 'pushUps' ? 'Second thought still asks for one sum.' : 'For earning time, and for Second thought.'}</Text>
      </Card>
    </Page>
  );
}

/** The two ways to earn time, each with its picture. */
const EARN_CHOICES: readonly { value: EarnWith; title: string; icon: IconName }[] = [
  { value: 'sums', title: 'Sums', icon: 'sums' },
  { value: 'pushUps', title: 'Push-ups', icon: 'pushUps' },
];

/** One sum of each level, as on the sums screen. */
const SUM_LIKE: Record<SumLevel, string> = { easy: '47 + 8', normal: '47 + 38', hard: '347 + 86' };

const styles = StyleSheet.create({
  choice: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, paddingTop: 12, paddingBottom: 11, paddingHorizontal: 6, alignItems: 'center', gap: 7 },
  dot: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
  choiceName: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: c.ink2 },
  line: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  sample: { alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: c.ground, borderWidth: 1.5, borderColor: c.rule },
  sum: { fontFamily: display.bold, fontSize: 44, lineHeight: 48, letterSpacing: -1.2 },
  note: { fontSize: 14, lineHeight: 19, color: c.ink3 },
});
