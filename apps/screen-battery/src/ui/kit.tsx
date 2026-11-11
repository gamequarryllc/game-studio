import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/platform/haptics';

import { c, display } from './theme';

// The few pieces every screen is built from.

/** A scrolling page with the app's side margins, clear of the notch and the tab bar. */
export function Page({ children, top = 0, bottom = 32 }: { children: ReactNode; top?: number; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.ground }}
      contentContainerStyle={{ paddingTop: insets.top + top, paddingBottom: insets.bottom + bottom, paddingHorizontal: 20, gap: 12 }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>;
}

/** The small capital label above a group. */
export function Label({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** The main action on a screen: light on the dark ground. */
export function BigButton({ label, onPress, quiet = false }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.big, quiet ? styles.bigQuiet : null, pressed ? { opacity: 0.75 } : null]}>
      <Text style={[styles.bigText, quiet ? { color: c.ink } : null]}>{label}</Text>
    </Pressable>
  );
}

/** A round minus or plus. */
export function StepButton({ sign, label, onPress, size = 48 }: { sign: '−' | '+'; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }, pressed ? { opacity: 0.7 } : null]}>
      <Text style={{ color: c.ink, fontSize: size * 0.5, lineHeight: size * 0.6, fontWeight: '400' }}>{sign}</Text>
    </Pressable>
  );
}

/** One line in a card that leads somewhere, with what is chosen on the right. */
export function LinkRow({ label, value, onPress, last = false }: { label: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, last ? null : styles.rowRule, pressed ? { opacity: 0.7 } : null]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
        <Chevron />
      </View>
    </Pressable>
  );
}

/** A small arrowhead, drawn so it needs no icon file. */
export function Chevron({ color = c.ink3 }: { color?: string }) {
  return <View style={{ width: 9, height: 9, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }], marginRight: 3 }} />;
}

/** A choice among a few: the chosen one is light, the others dark. */
export function Choice({ title, line, chosen, onPress, tag, disabled = false }: { title: string; line: string; chosen: boolean; onPress: () => void; tag?: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen, disabled }}
      aria-checked={chosen}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, { backgroundColor: chosen ? c.paper : c.ground }, pressed ? { opacity: 0.8 } : null]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: chosen ? c.onPaper : c.ink }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: chosen ? c.onPaper2 : c.ink3 }}>{line}</Text>
      </View>
      {tag ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: display.bold, fontSize: 34, lineHeight: 40, color: c.ink, marginBottom: 4 },
  lead: { fontSize: 16, lineHeight: 22, color: c.ink2, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: c.ink3 },
  card: { borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 16 },
  big: { minHeight: 56, borderRadius: 18, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  bigQuiet: { backgroundColor: c.raised },
  bigText: { fontSize: 17, fontWeight: '600', color: c.onPaper },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rowValue: { fontSize: 16, color: c.ink3, flexShrink: 1 },
  choice: { minHeight: 58, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tag: { borderWidth: 1, borderColor: c.ink3, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
});
