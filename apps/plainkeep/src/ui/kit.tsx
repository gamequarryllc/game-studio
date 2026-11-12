import type { ComponentRef, ReactNode, RefObject } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { HAIRLINE, NO_ORPHAN, TAB_BAR_SPACE, plate, radius, space, toneColor, type, useTheme, type Tone } from './theme';

// The small set of pieces every screen is built from.

/** A scrolling tab screen with a large plate-lettered title and an optional button beside it. */
export function TabScreen({
  title,
  action,
  children,
  testID,
  scroller,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
  scroller?: RefObject<ComponentRef<typeof ScrollView> | null>;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={scroller}
      testID={testID}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 22 : 10), paddingBottom: TAB_BAR_SPACE }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink, flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </ScrollView>
  );
}

/** A scrolling screen that sits under a navigation bar. */
export function PushedScreen({ children, testID, bottom }: { children: ReactNode; testID?: string; bottom?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.huge }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {children}
      </ScrollView>
      {bottom}
    </View>
  );
}

/** The heading of a group. Lettered like the rest of the plate, in the group's own colour when it has one. */
export function SectionLabel({ children, tone, trailing, testID }: { children: string; tone?: Tone; trailing?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionLabel}>
      <Text testID={testID} accessibilityRole="header" style={[styles.sectionText, { color: tone && tone !== 'muted' ? toneColor(c, tone) : c.ink, flex: 1 }]}>
        {children}
      </Text>
      {trailing}
    </View>
  );
}

export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[type.footnote, { color: c.ink2, marginHorizontal: space.xl + 2, marginTop: space.s }, style]}>{children}</Text>;
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: c.card }, style]}>
      {children}
    </View>
  );
}

export function Divider({ inset = space.l }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: HAIRLINE, backgroundColor: c.rule, marginLeft: inset }} />;
}

/** A list row: something on the left, a title and a line under it, a value and a chevron on the right. */
export function Row({
  title,
  subtitle,
  subtitleTone,
  leading,
  value,
  valueTone,
  chevron,
  onPress,
  destructive,
  tint,
  testID,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  subtitleTone?: Tone;
  leading?: ReactNode;
  value?: string;
  valueTone?: Tone | 'ink';
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  tint?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const titleColor = destructive ? c.red : tint ? c.blue : c.ink;
  const valueColor = valueTone === 'ink' ? c.ink : valueTone && valueTone !== 'muted' ? toneColor(c, valueTone) : c.ink2;
  const body = (
    <View style={styles.row}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, NO_ORPHAN, { color: titleColor }]} numberOfLines={2} lineBreakStrategyIOS="push-out">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: subtitleTone && subtitleTone !== 'muted' ? toneColor(c, subtitleTone) : c.ink2, marginTop: 1 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[type.body, type.tabular, { color: valueColor, marginLeft: space.s, flexShrink: 0, maxWidth: '55%' }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Icon name="chevron" size={14} color={c.ink3} style={{ marginLeft: 2 }} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => (pressed ? { backgroundColor: c.sunk } : null)}>
      {body}
    </Pressable>
  );
}

/** The square a thing's symbol sits in: a small enamel plate. */
export function IconPlate({ name, size = 36, tone = 'blue' }: { name: IconName; size?: number; tone?: Tone }) {
  const { c } = useTheme();
  const bg = tone === 'red' ? c.redSoft : tone === 'amber' ? c.amberSoft : tone === 'blue' ? c.blueSoft : c.sunk;
  const fg = tone === 'muted' ? c.ink2 : toneColor(c, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.54} color={fg} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'soft' | 'plain' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const fg = kind === 'primary' ? c.onButton : kind === 'danger' ? c.red : c.blue;
  const bg = kind === 'primary' ? c.button : kind === 'soft' ? c.blueSoft : 'transparent';
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, kind === 'plain' || kind === 'danger' ? { minHeight: 44 } : null, style]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[type.headline, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The button beside a large title: a quiet toolbar button, as in the iPhone's own apps. */
export function RoundButton({ icon, onPress, label, testID }: { icon: IconName; onPress: () => void; label: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.round, { backgroundColor: pressed ? c.sunk : c.card }]}>
      <Icon name={icon} size={20} color={c.blue} />
    </Pressable>
  );
}

/** A text button for a navigation bar. */
export function BarButton({ label, onPress, bold, disabled, testID }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} hitSlop={10} onPress={onPress} style={{ paddingHorizontal: Platform.OS === 'web' ? space.l : 0, paddingVertical: 6 }}>
      <Text style={[type.body, { color: disabled ? c.ink3 : c.blue, fontWeight: bold ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, { backgroundColor: selected ? c.button : c.card }]}>
      <Text style={[type.subhead, { color: selected ? c.onButton : c.ink, fontWeight: selected ? '600' : '400' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Says what a screen is for when there is nothing on it yet. Left-aligned, like a note on the wall. */
export function EmptyState({ title, body, action, art }: { title: string; body: string; action?: ReactNode; art?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      {art}
      <Text style={[type.title, NO_ORPHAN, { color: c.ink, marginTop: art ? space.l : 0 }]}>{title}</Text>
      <Text style={[type.callout, { color: c.ink2, marginTop: space.s }]}>{body}</Text>
      {action ? <View style={{ marginTop: space.xl, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/** A short notice inside a screen. */
export function Notice({ icon = 'info', tone = 'muted', children, action, testID }: { icon?: IconName; tone?: Tone; children: ReactNode; action?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  const fg = tone === 'muted' ? c.ink2 : toneColor(c, tone);
  const bg = tone === 'amber' ? c.amberSoft : tone === 'red' ? c.redSoft : tone === 'blue' ? c.blueSoft : c.sunk;
  return (
    <View testID={testID} style={[styles.notice, { backgroundColor: bg }]}>
      <Icon name={icon} size={16} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: space.s }}>
        <Text style={[type.footnote, { color: tone === 'muted' ? c.ink2 : c.ink }]}>{children}</Text>
        {action}
      </View>
    </View>
  );
}

/** A small text link inside a notice or under a list. */
export function LinkText({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <Text style={[type.footnote, { color: c.blue, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, marginBottom: space.m },
  sectionLabel: { flexDirection: 'row', alignItems: 'baseline', marginHorizontal: space.xl + 2, marginTop: space.xxl, marginBottom: space.s },
  sectionText: { fontFamily: plate.semibold, fontSize: 21, lineHeight: 26, letterSpacing: 0.3 },
  card: { marginHorizontal: space.xl, borderRadius: radius.m, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 11, minHeight: 48 },
  button: { minHeight: 50, borderRadius: radius.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: space.xl },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 38, borderRadius: 19, maxWidth: 200 },
  empty: { paddingHorizontal: space.xl + 2, paddingTop: space.huge, paddingBottom: space.xl },
  notice: { flexDirection: 'row', gap: space.s, marginHorizontal: space.xl, marginTop: space.m, padding: space.m, borderRadius: radius.m },
});
