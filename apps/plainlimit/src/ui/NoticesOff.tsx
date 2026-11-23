import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tap } from '@/platform/haptics';
import { openPhoneSettings } from '@/platform/notices';
import { Chevron, IconTile } from '@/ui/kit';
import { c } from '@/ui/theme';
import { useNotices } from '@/ui/useNotices';

// Today's warning that notifications are off. The empty screen's "I need more
// time" and Second thought's sum both reach the app through a notification,
// and so does the "Nearly out" warning; setup says so when it asks, but they
// can be turned off any day in the iPhone's Settings, and then those buttons
// do nothing with no sign of why (the owner, 2026-11-23). One row, only while
// they are off, that opens Plainlimit's page in Settings.

const AMBER = '#F79200';

/** `asks`: something is set up that needs a notification to work (sums at empty, or Second thought); otherwise only the warning is lost. */
export function NoticesOff({ asks }: { asks: boolean }) {
  const [answer] = useNotices();
  if (answer !== 'off') return null;
  const sub = asks ? 'Asking for more time won\u2019t work.' : 'No warning when you\u2019re nearly out.';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Notifications are off. ${sub} Opens Settings.`}
      onPress={() => {
        tap();
        openPhoneSettings();
      }}
      style={({ pressed }) => [styles.row, pressed ? { opacity: 0.7 } : null]}>
      <IconTile icon={{ name: 'bellOff', bg: AMBER }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={styles.name}>
          Notifications are off
        </Text>
        <Text numberOfLines={2} style={styles.sub}>
          {sub}
        </Text>
      </View>
      <Chevron color="#F7B24D" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 58, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: AMBER, backgroundColor: `${AMBER}1A` },
  name: { fontSize: 16, fontWeight: '500', color: c.ink },
  sub: { fontSize: 13.5, lineHeight: 18, color: '#F7C98A' },
});
