import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { cellsLeft, fractionUsed, wordFor } from '@/domain/battery';
import { clockLabel, clockLabelOf, durationLabel } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { topUpPlan } from '@/domain/puzzle';
import { toneAt } from '@/domain/tone';
import { DEV_TOOLS, SCREEN_TIME_AVAILABLE } from '@/platform/screenTime';
import { useDoc, useNow } from '@/state/store';
import { Battery } from '@/ui/Battery';
import { BigButton, Card, Label, Page, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';

export default function Today() {
  const router = useRouter();
  const now = useNow();
  const { settings, day } = useDoc();

  const cells = cellsLeft(day.usedMinutes, settings.goalMinutes);
  const tone = toneAt(fractionUsed(day.usedMinutes, settings.goalMinutes));
  const recharge = clockLabel(settings.rechargeMinute);
  const empty = cells === 0;
  const unlocked = isUnlocked(day, now);
  const next = topUpPlan(day.topUps);

  return (
    <Page top={24} bottom={24}>
      <Title>Today</Title>

      <View style={[styles.hero, { backgroundColor: tone.bg }]}>
        <Battery cells={cells} tone={tone} height={84} />
        <View style={{ gap: 6 }}>
          <Text style={[styles.word, { color: tone.fg }]}>{wordFor(cells)}</Text>
          <Text style={[styles.recharge, { color: tone.fg }]}>Recharges at {recharge}</Text>
        </View>
      </View>

      {unlocked ? (
        <Card style={{ paddingVertical: 14 }}>
          <Text style={styles.body}>Earned time runs until {clockLabelOf(new Date(day.unlockedUntil as string))}.</Text>
        </Card>
      ) : null}

      {empty && !unlocked && settings.emptyLevel === 'work' ? (
        <BigButton label={`Solve ${next.sums} sums for ${next.minutes} more minutes`} onPress={() => router.push('/puzzle')} />
      ) : null}
      {empty && !unlocked && settings.emptyLevel === 'locked' ? (
        <Card style={{ paddingVertical: 14 }}>
          <Text style={styles.body}>Locked until {recharge}. {allowedLine(settings.allowed)}</Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 8, gap: 10 }}>
        <View style={styles.usedRow}>
          <Label>Used so far</Label>
          <Text style={styles.used}>
            {durationLabel(day.usedMinutes)} of {durationLabel(settings.goalMinutes)}
          </Text>
        </View>
        <Card style={{ paddingVertical: 14, gap: 6 }}>
          <Text style={styles.body}>{SCREEN_TIME_AVAILABLE ? 'The time each app used shows here.' : 'On an iPhone, the time each app used shows here.'}</Text>
          {DEV_TOOLS && !SCREEN_TIME_AVAILABLE ? <Text style={styles.note}>This preview has no real screen time. Drain the battery from Settings, under Developer.</Text> : null}
        </Card>
      </View>
    </Page>
  );
}

/** "Phone, Messages and Maps still open." */
export function allowedLine(allowed: readonly string[]): string {
  if (allowed.length === 0) return 'Nothing opens until then.';
  if (allowed.length === 1) return `${allowed[0]} still opens.`;
  return `${allowed.slice(0, -1).join(', ')} and ${allowed[allowed.length - 1]} still open.`;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24, gap: 18 },
  word: { fontFamily: display.bold, fontSize: 38, lineHeight: 42, letterSpacing: -0.6 },
  recharge: { fontSize: 16, fontWeight: '600' },
  usedRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  used: { fontFamily: display.semi, fontSize: 17, color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
