import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cellsLeft } from '@/domain/battery';
import { clockLabel, clockLabelOf } from '@/domain/day';
import { makeRandom, makeSums, topUpPlan, type Sum } from '@/domain/puzzle';
import { success } from '@/platform/haptics';
import { sumLevelFor } from '@/domain/pro';
import { store } from '@/state/store';
import { BigButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';
import { useSumEntry } from '@/ui/useSumEntry';

// "Work for it": a few sums for a little more time. Each top-up since the
// last recharge asks for more sums and gives fewer minutes.

export default function Puzzle() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, day, accent } = useDay();

  // The plan and the sums are fixed when the screen opens, so earning the
  // time (which raises the count) does not change what is on the screen.
  const [plan] = useState(() => topUpPlan(day.topUps));
  const [sums] = useState<Sum[]>(() => makeSums(plan.sums, makeRandom(Date.now()), sumLevelFor(settings, store.hasPro())));
  const [at, setAt] = useState(0);
  const [earnedUntil, setEarnedUntil] = useState<string | null>(null);

  // Each right answer moves on by itself; the last one earns the time.
  const sum = sums[Math.min(at, sums.length - 1)];
  const entry = useSumEntry(sum, () => {
    if (at + 1 < sums.length) {
      setAt(at + 1);
      return;
    }
    success();
    store.earnTopUp();
    setEarnedUntil(store.get().doc.day.unlockedUntil);
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const frame = { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 };

  const hasBattery = cellsLeft(day.usedMinutes, settings.goalMinutes) > 0;
  if (earnedUntil === null && (settings.emptyLevel !== 'work' || hasBattery)) {
    return (
      <View style={[styles.page, frame]}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.title}>
            Nothing to earn
          </Text>
          <Text style={styles.lead}>{hasBattery ? 'Your battery still has charge. Sums are for when it is empty.' : 'Sums are switched off. Choose “Work for it” in Settings to use them.'}</Text>
        </View>
        <BigButton label="Back" onPress={leave} />
      </View>
    );
  }

  if (earnedUntil !== null) {
    const after = topUpPlan(store.get().doc.day.topUps);
    return (
      <View style={[styles.page, frame]}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {plan.minutes} minutes earned
          </Text>
          <Text style={styles.lead}>Your apps open until {clockLabelOf(new Date(earnedUntil))}. The battery is still empty.</Text>
          <Text style={styles.small}>
            Next time it&apos;s {after.sums} sums for {after.minutes} minutes.
          </Text>
        </View>
        <BigButton label="Done" onPress={leave} />
      </View>
    );
  }

  return (
    <View style={[styles.page, frame]}>
      <View style={{ gap: 26 }}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.title}>
            Earn {plan.minutes} minutes
          </Text>
          <Text style={styles.lead}>{plan.sums} sums, no skipping. Adds {plan.minutes} minutes now; your battery still refills at {clockLabel(settings.rechargeMinute)}.</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {sums.length <= 7 ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {sums.map((_, i) => (
                <View key={i} style={{ width: sums.length > 5 ? 22 : 34, height: 8, borderRadius: 4, backgroundColor: i < at ? accent : i === at ? c.ink : c.raised }} />
              ))}
            </View>
          ) : (
            // From the fourth unlock on there are 10, 13, 16... sums: one bar, filling.
            <View style={{ width: 150, height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
              <View style={{ width: `${(at / sums.length) * 100}%`, height: 8, borderRadius: 4, backgroundColor: accent }} />
            </View>
          )}
          <Text style={styles.count}>
            Sum {at + 1} of {sums.length}
          </Text>
        </View>

        <Text accessibilityLabel={`${sum.a} plus ${sum.b}`} numberOfLines={1} adjustsFontSizeToFit style={styles.sum}>
          {sum.a} + {sum.b}
        </Text>

        <View style={{ gap: 8 }}>
          <Text nativeID="answer-label" style={styles.fieldLabel}>
            Your answer
          </Text>
          <TextInput
            accessibilityLabelledBy="answer-label"
            aria-labelledby="answer-label"
            value={entry.typed}
            onChangeText={entry.type}
            onSubmitEditing={entry.submit}
            keyboardType="number-pad"
            inputMode="numeric"
            autoFocus
            style={[styles.input, entry.wrong ? { borderColor: '#F0A08C' } : null]}
          />
          {entry.wrong ? (
            <Text accessibilityLiveRegion="polite" style={styles.wrong}>
              Not {entry.wrong}. Try again.
            </Text>
          ) : null}
        </View>

        <BigButton label="Check" onPress={entry.submit} />
      </View>

      <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.stop, pressed ? { opacity: 0.6 } : null]}>
        <Text style={styles.stopText}>Never mind, I&apos;ll stop</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 24, justifyContent: 'space-between' },
  title: { fontFamily: display.bold, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: c.ink },
  lead: { fontSize: 16, lineHeight: 22, color: c.ink2 },
  small: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  count: { fontSize: 14, fontWeight: '600', color: c.ink3 },
  sum: { fontFamily: display.bold, fontSize: 88, lineHeight: 90, letterSpacing: -3.5, color: c.ink },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: c.ink3 },
  input: { height: 64, borderRadius: 18, borderWidth: 2, borderColor: c.outline, backgroundColor: c.card, color: c.ink, paddingHorizontal: 18, fontSize: 28, fontWeight: '600' },
  wrong: { fontSize: 15, color: '#F0A08C' },
  stop: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stopText: { fontSize: 16, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
});
