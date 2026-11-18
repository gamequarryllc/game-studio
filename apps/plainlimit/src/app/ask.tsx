import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askLead, DEFAULT_ASK_FIRST, opensCountedApps } from '@/domain/askFirst';
import { cellsLeft } from '@/domain/battery';
import { clockLabel, clockLabelOf } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { isRight, makeRandom, makeSums, type Sum } from '@/domain/puzzle';
import { success, warning } from '@/platform/haptics';
import { store } from '@/state/store';
import { BigButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// The sum an "Ask first" app asks for (src/domain/askFirst.ts): reached from
// the covering screen's notification. One sum opens the list for a while.

export default function Ask() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, day, now } = useDay();
  const ask = settings.askFirst ?? DEFAULT_ASK_FIRST;
  const [sum] = useState<Sum>(() => makeSums(1, makeRandom(Date.now()))[0]);
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(false);
  const [openUntil, setOpenUntil] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const frame = { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 };
  const empty = cellsLeft(day.usedMinutes, settings.goalMinutes) === 0;
  const opensCounted = opensCountedApps(empty, isUnlocked(day, now));

  if (openUntil || failed) {
    return (
      <View style={[styles.page, frame]}>
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {openUntil ? `Open for ${ask.openMinutes} minutes` : 'Not opened'}
          </Text>
          <Text style={styles.lead}>
            {openUntil
              ? `Your Second thought apps are open until ${clockLabelOf(openUntil)}. Go back to the one you wanted.${opensCounted ? '' : ` Apps that also count stay locked, as the battery is empty.`}`
              : 'The phone didn’t take the timer, so the apps stay covered. Try again in a moment.'}
          </Text>
        </View>
        <BigButton label="Done" onPress={leave} />
      </View>
    );
  }

  const check = async () => {
    if (busy) return;
    if (!isRight(sum, typed)) {
      warning();
      setWrong(true);
      return;
    }
    setBusy(true);
    try {
      const until = await store.openAskFirst();
      if (until) {
        success();
        setOpenUntil(until);
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.page, frame]}>
      <View style={{ gap: 26 }}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.title}>
            One sum to open
          </Text>
          <Text style={styles.lead}>{askLead(ask.openMinutes, opensCounted, clockLabel(settings.rechargeMinute))}</Text>
        </View>

        <Text accessibilityLabel={`${sum.a} plus ${sum.b}`} style={styles.sum}>
          {sum.a} + {sum.b}
        </Text>

        <View style={{ gap: 8 }}>
          <Text nativeID="ask-answer-label" style={styles.fieldLabel}>
            Your answer
          </Text>
          <TextInput
            accessibilityLabelledBy="ask-answer-label"
            aria-labelledby="ask-answer-label"
            value={typed}
            onChangeText={(t) => {
              setTyped(t.replace(/[^0-9]/g, '').slice(0, 4));
              setWrong(false);
            }}
            onSubmitEditing={() => void check()}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            autoFocus
            style={[styles.input, wrong ? { borderColor: '#F0A08C' } : null]}
          />
          {wrong ? (
            <Text accessibilityLiveRegion="polite" style={styles.wrong}>
              Not {typed}. Try again.
            </Text>
          ) : null}
        </View>

        <BigButton label={busy ? 'One moment…' : 'Open'} disabled={typed === ''} onPress={() => void check()} />
      </View>

      <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.stop, pressed ? { opacity: 0.6 } : null]}>
        <Text style={styles.stopText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 24, justifyContent: 'space-between' },
  title: { fontFamily: display.bold, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: c.ink },
  lead: { fontSize: 16, lineHeight: 22, color: c.ink2 },
  sum: { fontFamily: display.bold, fontSize: 72, lineHeight: 76, letterSpacing: -2, color: c.ink },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: c.ink3 },
  input: { height: 60, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, paddingHorizontal: 18, fontSize: 26, fontWeight: '600', color: c.ink, backgroundColor: c.card },
  wrong: { fontSize: 15, color: '#F0A08C' },
  stop: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  stopText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
});
