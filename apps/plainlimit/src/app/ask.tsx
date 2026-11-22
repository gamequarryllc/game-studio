import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askLead, askOpened, DEFAULT_ASK_FIRST, openChoice, opensCountedApps } from '@/domain/askFirst';
import { cellsLeft } from '@/domain/battery';
import { clockLabel, clockLabelOf } from '@/domain/day';
import { isUnlocked } from '@/domain/dayState';
import { makeRandom, makeSums, type Sum } from '@/domain/puzzle';
import { success } from '@/platform/haptics';
import { sumLevelFor } from '@/domain/pro';
import type { AskOpen } from '@/platform/askFirst';
import { store } from '@/state/store';
import { BigButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';
import { useSumEntry } from '@/ui/useSumEntry';

// The sum an "Ask first" app asks for (src/domain/askFirst.ts): reached from
// the covering screen's notification. One sum opens the list for a while. The
// person then goes back to the app themselves: iOS does not let the covering
// screen tell this app which app it was drawn over (NOTES.md).

export default function Ask() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, day, now } = useDay();
  const ask = settings.askFirst ?? DEFAULT_ASK_FIRST;
  const [sum] = useState<Sum>(() => makeSums(1, makeRandom(Date.now()), sumLevelFor(settings, store.hasPro()))[0]);
  const [opened, setOpened] = useState<AskOpen | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const frame = { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 };
  const empty = cellsLeft(day.usedMinutes, settings.goalMinutes) === 0;
  const opensCounted = opensCountedApps(empty, isUnlocked(day, now));

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const done = await store.openAskFirst();
      if (!done) {
        setFailed(true);
        return;
      }
      success();
      setOpened(done);
    } finally {
      setBusy(false);
    }
  };
  // A right answer opens by itself; the button is only one more way in.
  const entry = useSumEntry(sum, () => void open(), true);

  if (opened || failed) {
    // "Until I leave it" only where the phone took its timers; otherwise it opened for the chosen minutes.
    const words = opened ? askOpened(opened.inUse ? 'use' : ask.openMinutes, clockLabelOf(opened.until)) : null;
    return (
      <View style={[styles.page, frame]}>
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {words ? words.title : 'Not opened'}
          </Text>
          <Text style={styles.lead}>
            {words
              ? `${words.line}${opensCounted ? '' : ` Apps that also count stay locked, as the battery is empty.`}`
              : 'The phone didn’t take the timer, so the apps stay covered. Try again in a moment.'}
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
            One sum to open
          </Text>
          <Text style={styles.lead}>{askLead(openChoice(ask), opensCounted, clockLabel(settings.rechargeMinute))}</Text>
        </View>

        <Text accessibilityLabel={`${sum.a} plus ${sum.b}`} numberOfLines={1} adjustsFontSizeToFit style={styles.sum}>
          {sum.a} + {sum.b}
        </Text>

        <View style={{ gap: 8 }}>
          <Text nativeID="ask-answer-label" style={styles.fieldLabel}>
            Your answer
          </Text>
          <TextInput
            accessibilityLabelledBy="ask-answer-label"
            aria-labelledby="ask-answer-label"
            value={entry.typed}
            onChangeText={entry.type}
            onSubmitEditing={entry.submit}
            editable={!busy}
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

        <BigButton label={busy ? 'One moment…' : 'Open'} disabled={entry.typed === '' || busy} onPress={entry.submit} />
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
