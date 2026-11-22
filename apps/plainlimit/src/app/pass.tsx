import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clockLabelOf } from '@/domain/day';
import { success } from '@/platform/haptics';
import { store } from '@/state/store';
import { BigButton } from '@/ui/kit';
import { useRecord, weekday } from '@/ui/RecordCard';
import { c, display } from '@/ui/theme';

// Using an emergency pass (record.ts): everything, settings too, for 15
// minutes. Says what it costs before it is used.

export default function Pass() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { view, doc } = useRecord();
  const check = store.passCheck();
  // Read from the record, not kept on this screen: the screen can be drawn
  // afresh as the store changes, and coming back here mid-pass shows it too.
  const openUntil = check === 'running' ? doc.record?.passUntil ?? null : null;
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const rows: [string, string, string?][] = [
    check === 'ok' ? ['Passes left after this', String(view.passes - 1)] : ['Passes saved', String(view.passes)],
    ['Next pass', weekday(view.nextPass)],
  ];
  // The streak is days without a pass (record.ts): using one ends it, and the sheet says so before the button.
  if (check === 'ok' && view.streakDays > 0) rows.push(['Your streak', `Ends at ${view.streakDays} ${view.streakDays === 1 ? 'day' : 'days'}`, '#FF7B6B']);

  if (openUntil) {
    return (
      <View style={[styles.page, { paddingTop: Platform.OS === 'ios' ? 32 : insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={styles.title}>Open until {clockLabelOf(new Date(openUntil))}</Text>
          <Text style={styles.body}>Everything is open, settings too. Fix what you need: make an app an essential, or change your goal.</Text>
        </View>
        <BigButton label="Done" onPress={leave} />
      </View>
    );
  }

  const why =
    check === 'none' ? `No passes saved. The next comes on ${weekday(view.nextPass)}.` : check === 'usedToday' ? 'A pass was already used today. One can be used again after the recharge.' : 'One pass can be used a day.';

  return (
    <View style={[styles.page, { paddingTop: Platform.OS === 'ios' ? 32 : insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ gap: 18 }}>
        <Text accessibilityRole="header" style={styles.title}>Use an emergency pass?</Text>
        <Text style={styles.body}>Everything opens for 15 minutes, settings included, so you can fix what you need: make an app an essential, or change your goal.</Text>
        <View>
          {rows.map(([label, value, colour], i) => (
            <View key={label} style={[styles.row, i < rows.length - 1 ? styles.rule : null]}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={[styles.rowValue, colour ? { color: colour } : null]}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={check === 'ok' ? styles.note : styles.why}>{why}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {check === 'ok' ? (
          <BigButton
            label="Open everything for 15 minutes"
            onPress={() => {
              if (store.usePass()) success();
            }}
          />
        ) : null}
        <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.stop, pressed ? { opacity: 0.6 } : null]}>
          <Text style={styles.stopText}>{check === 'ok' ? 'Not now' : 'Close'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 24, justifyContent: 'space-between' },
  title: { fontFamily: display.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: c.ink },
  body: { fontSize: 16, lineHeight: 23, color: c.ink2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 15, color: c.ink3 },
  rowValue: { fontSize: 15, fontWeight: '600', color: c.ink },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  why: { fontSize: 15, lineHeight: 21, color: c.ink },
  stop: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  stopText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
});
