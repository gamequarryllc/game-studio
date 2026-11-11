import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tone } from '@/domain/tone';
import { tap } from '@/platform/haptics';

import { Battery } from './Battery';
import { display } from './theme';

// What covers an app when the battery is low or empty. On an iPhone the
// phone draws this itself and allows only these parts: a picture, a title,
// one line and up to two buttons. This is the same layout, for the preview.

export interface ShieldButton {
  label: string;
  onPress: () => void;
}

export function Shield({ tone, cells, title, line, primary, secondary }: { tone: Tone; cells: number; title: string; line: string; primary: ShieldButton; secondary?: ShieldButton }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { backgroundColor: tone.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.middle}>
        <View style={{ width: 190 }}>
          <Battery cells={cells} tone={tone} height={64} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: tone.fg }]}>
          {title}
        </Text>
        <Text style={[styles.line, { color: tone.fg }]}>{line}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap();
            primary.onPress();
          }}
          style={({ pressed }) => [styles.primary, { backgroundColor: tone.dark ? '#FFFFFF' : '#10120F' }, pressed ? { opacity: 0.8 } : null]}>
          <Text style={[styles.buttonText, { color: tone.dark ? '#10120F' : '#F2F3F1' }]}>{primary.label}</Text>
        </Pressable>
        {secondary ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              secondary.onPress();
            }}
            style={({ pressed }) => [styles.secondary, pressed ? { opacity: 0.6 } : null]}>
            <Text style={[styles.buttonText, { color: tone.fg }]}>{secondary.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  title: { fontFamily: display.bold, fontSize: 46, lineHeight: 50, letterSpacing: -1, textAlign: 'center' },
  line: { fontSize: 18, lineHeight: 25, fontWeight: '500', textAlign: 'center', maxWidth: 310 },
  primary: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondary: { minHeight: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
