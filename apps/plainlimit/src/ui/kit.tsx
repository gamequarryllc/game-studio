import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/platform/haptics';

import { c, display } from './theme';
import { Icon, type IconName } from './icons';

// The few pieces every screen is built from.

/**
 * A scrolling page with the app's side margins, clear of the notch and the tab bar.
 * `header` is for a screen under the navigation bar (the one with the back
 * button): that bar already clears the notch, so the page must not clear it a
 * second time. Up to build 137 it did, and every such screen's title sat a
 * notch's height too low.
 */
export function Page({ children, top = 0, bottom = 32, header = false }: { children: ReactNode; top?: number; bottom?: number; header?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.ground }}
        // On the web the tab bar floats over the page, so the end can scroll clear of it.
        contentContainerStyle={{ paddingTop: (header ? 0 : insets.top) + top, paddingBottom: insets.bottom + bottom + (Platform.OS === 'web' ? 96 : 0), paddingHorizontal: 20, gap: 12 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {header ? null : <StatusBand />}
    </View>
  );
}

/**
 * A strip of the page's own colour behind the clock and the battery icon, so a
 * scrolled page passes under it instead of showing through the status bar.
 * It covers only what is already blank when the page is at the top.
 */
export function StatusBand() {
  const insets = useSafeAreaInsets();
  if (insets.top === 0) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: c.ground }} />;
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
export function BigButton({ label, onPress, quiet = false, disabled = false }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.big, quiet ? styles.bigQuiet : null, pressed ? { opacity: 0.75 } : null, disabled ? { opacity: 0.4 } : null]}>
      <Text style={[styles.bigText, quiet ? { color: c.ink } : null]}>{label}</Text>
    </Pressable>
  );
}

/** A round minus or plus. */
export function StepButton({ sign, label, onPress, size = 48, disabled = false }: { sign: '−' | '+'; label: string; onPress: () => void; size?: number; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: c.outline, backgroundColor: pressed ? c.raised : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }]}>
      <Text style={{ color: c.ink, fontSize: size * 0.5, lineHeight: size * 0.6, fontWeight: '400' }}>{sign}</Text>
    </Pressable>
  );
}

/** A row's picture: a white symbol on a coloured rounded square, as in the iPhone's own Settings. */
export interface RowIcon {
  name: IconName;
  bg: string;
  /** The symbol's colour, when white would not show on `bg`. */
  fg?: string;
}

/** The colours of the row pictures. */
export const tiles = { green: '#2FB457', red: '#E5484D', orange: '#F08A24', blue: '#3B82F6', purple: '#8B5CF6', gray: '#5B6168', yellow: '#D9A400', teal: '#14A3A3', pink: '#E24C8B' } as const;

export function IconTile({ icon, size = 32 }: { icon: RowIcon; size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" aria-hidden style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: icon.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon.name} size={size * 0.6} color={icon.fg ?? '#FFFFFF'} />
    </View>
  );
}

/** The gold mark on what Plainlimit Pro adds. */
export function ProBadge() {
  return (
    <View style={styles.pro}>
      <Text style={styles.proText}>PRO</Text>
    </View>
  );
}

/**
 * One line in a card that leads somewhere, with what is chosen on the right.
 * With `icon` it opens with a small picture; `sub` is a quiet second line;
 * `pro` marks it as part of Plainlimit Pro.
 */
export function LinkRow({ label, value = '', onPress, last = false, icon, sub, pro = false }: { label: string; value?: string; onPress: () => void; last?: boolean; icon?: RowIcon; sub?: string; pro?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, value, pro ? 'Pro' : ''].filter(Boolean).join(', ')}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, sub ? { paddingVertical: 9 } : null, last ? null : styles.rowRule, pressed ? { opacity: 0.7 } : null]}>
      {icon ? <IconTile icon={icon} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={styles.rowLabel}>
          {label}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={styles.rowSub}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {value ? (
          <Text numberOfLines={1} style={styles.rowValue}>
            {value}
          </Text>
        ) : null}
        {pro ? <ProBadge /> : null}
        <Chevron />
      </View>
    </Pressable>
  );
}

/** A small arrowhead, drawn so it needs no icon file. */
export function Chevron({ color = c.ink3 }: { color?: string }) {
  return <View style={{ width: 9, height: 9, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }], marginRight: 3 }} />;
}

/**
 * A choice among a few short options, side by side: the chosen one is filled
 * with the accent. An option marked `wide` takes a row of its own under the
 * others (a longer label that is still one of the same choices).
 */
export function Pills<T extends string | number>({
  options,
  chosen,
  onChange,
  accent = c.paper,
}: {
  options: readonly { value: T; label: string; spoken?: string; pro?: boolean; wide?: boolean }[];
  chosen: T;
  onChange: (value: T) => void;
  accent?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.pills}>
      {options.map(({ value, label, spoken, pro, wide }) => {
        const on = value === chosen;
        return (
          <Pressable
            key={String(value)}
            accessibilityRole="radio"
            accessibilityLabel={spoken ?? label}
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => {
              tap();
              onChange(value);
            }}
            style={({ pressed }) => [styles.pill, wide ? styles.pillWide : null, on ? { backgroundColor: accent, borderColor: accent } : null, pressed ? { opacity: 0.8 } : null]}>
            <Text style={[styles.pillText, on ? { color: c.onTone } : null]}>{label}</Text>
            {pro ? <ProBadge /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A choice among a few: the chosen one is light, the others dark. */
export function Choice({
  title,
  line,
  rows,
  chosen,
  onPress,
  tag,
  disabled = false,
  accent = c.paper,
}: {
  title: string;
  line?: string;
  /** A short breakdown under the title: each a label and what it says. */
  rows?: readonly (readonly [string, string])[];
  chosen: boolean;
  onPress: () => void;
  tag?: string;
  disabled?: boolean;
  accent?: string;
}) {
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
      style={({ pressed }) => [styles.choice, chosen ? { borderColor: accent, borderWidth: 2 } : null, disabled ? { opacity: 0.6 } : null, pressed ? { opacity: 0.8 } : null]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: display.semi, fontSize: 18, lineHeight: 22, color: c.ink }}>{title}</Text>
        {line ? <Text style={{ fontSize: 14, lineHeight: 19, color: chosen ? c.ink2 : c.ink3 }}>{line}</Text> : null}
        {rows?.map(([label, says]) => (
          <View key={label} style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink3 }}>{label}</Text>
            <Text style={{ fontSize: 15, lineHeight: 20, color: c.ink2 }}>{says}</Text>
          </View>
        ))}
      </View>
      {/* The chosen row: an outline in the day's colour and a checkmark, like a settings list. */}
      {chosen ? <View style={[styles.check, { borderColor: accent }]} /> : null}
      {tag ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: display.bold, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: c.ink, marginBottom: 6 },
  lead: { fontSize: 16, lineHeight: 22, color: c.ink2, marginBottom: 6 },
  label: { fontSize: 15, fontWeight: '600', color: c.ink3 },
  card: { borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, paddingHorizontal: 16 },
  big: { minHeight: 58, borderRadius: 29, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  bigQuiet: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.outline },
  bigText: { fontSize: 17, fontWeight: '600', color: c.onPaper },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowSub: { fontSize: 13.5, lineHeight: 18, color: c.ink3 },
  pro: { borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6, backgroundColor: '#F2C656' },
  proText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3, color: c.onPaper },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rowValue: { fontSize: 16, color: c.ink3, flexShrink: 1 },
  choice: { minHeight: 62, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 8, height: 15, borderRightWidth: 2.5, borderBottomWidth: 2.5, transform: [{ rotate: '45deg' }], marginRight: 4, marginTop: -4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  pillWide: { flexBasis: '100%' },
  pillText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
  tag: { borderWidth: 1, borderColor: c.ink3, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
});
