import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { CATEGORY_INFO } from '@/domain/categories';
import type { Category } from '@/domain/types';
import { tap } from '@/platform/haptics';

import { CategoryIcon, Icon, type IconName } from './Icon';
import { FLOAT_SHADOW, HAIRLINE, NO_ORPHAN, radius, space, type, useTheme } from './theme';

// The small set of pieces the screens are built from.

/** Margin lettering over a group: small spaced capitals, like the legend of a chart. */
export function MarginLabel({ children, trailing, style, testID }: { children: string; trailing?: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.marginLabel, style]}>
      <Text testID={testID} accessibilityRole="header" style={[type.margin, { color: c.ink2, flex: 1 }]}>
        {children}
      </Text>
      {trailing}
    </View>
  );
}

export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[type.footnote, NO_ORPHAN, { color: c.ink2, marginHorizontal: space.xl + 2, marginTop: space.s }, style]}>{children}</Text>;
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: c.card, borderColor: c.rule }, style]}>
      {children}
    </View>
  );
}

export function Divider({ inset = space.l }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: HAIRLINE, backgroundColor: c.rule, marginLeft: inset }} />;
}

export function Row({
  title,
  subtitle,
  icon,
  value,
  chevron,
  onPress,
  destructive,
  trailing,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={20} color={destructive ? c.red : c.ink2} style={{ marginRight: space.m }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { color: destructive ? c.red : c.ink }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[type.body, { color: c.ink2, marginLeft: space.s, flexShrink: 0 }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <Icon name="chevron" size={14} color={c.ink3} style={{ marginLeft: 4 }} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => (pressed ? { backgroundColor: c.sunk } : null)}>
      {body}
    </Pressable>
  );
}

export function SwitchRow({ title, subtitle, value, onChange, testID }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { color: c.ink }]}>{title}</Text>
        {subtitle ? <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]}>{subtitle}</Text> : null}
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.rule }} {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF', thumbColor: '#FFFFFF' } as object) : {})} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy,
  disabled,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet' | 'plain';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.button : kind === 'quiet' ? c.sunk : 'transparent';
  const fg = kind === 'primary' ? c.onButton : kind === 'quiet' ? c.ink : c.accent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[type.headline, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A word in the navigation bar: Cancel, Save, Close. */
export function BarButton({ label, onPress, bold, disabled, testID }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={10} onPress={onPress} style={{ paddingHorizontal: Platform.OS === 'web' ? 16 : 4, paddingVertical: 6 }}>
      <Text style={[type.body, { color: disabled ? c.ink3 : c.accent, fontWeight: bold ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

/** A round control that floats over the map. */
export function RoundButton({ icon, onPress, label, testID, active }: { icon: IconName; onPress: () => void; label: string; testID?: string; active?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.round, FLOAT_SHADOW, { backgroundColor: active ? c.accent : c.glass, borderColor: c.glassEdge, opacity: pressed ? 0.75 : 1 }]}>
      <Icon name={icon} size={20} color={active ? c.onButton : c.ink} />
    </Pressable>
  );
}

/** A kind of place, as a small inked tag. */
export function CategoryTag({ category, small }: { category: Category; small?: boolean }) {
  const { dark, c } = useTheme();
  const info = CATEGORY_INFO[category];
  return (
    <View style={[styles.tag, { backgroundColor: info.color + (dark ? '4D' : '1F'), paddingVertical: small ? 3 : 5 }]}>
      <CategoryIcon category={category} size={small ? 12 : 14} color={info.color} />
      <Text style={[small ? type.caption : type.footnote, { color: dark ? c.ink : info.color, fontWeight: '600' }]}>{info.label}</Text>
    </View>
  );
}

/** A choice among a few, shown as a pill: a filter, a kind of place, a person. */
export function Chip({ label, selected, onPress, color, leading, testID, onRemove }: { label: string; selected?: boolean; onPress?: () => void; color?: string; leading?: ReactNode; testID?: string; onRemove?: () => void }) {
  const { c } = useTheme();
  const ink = color ?? c.accent;
  const body = (
    <View style={[styles.chip, { backgroundColor: selected ? ink : c.card, borderColor: selected ? ink : c.rule }]}>
      {leading}
      <Text style={[type.subhead, { color: selected ? '#FFFDF8' : c.ink, fontWeight: selected ? '600' : '400' }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={8} onPress={onRemove}>
          <Icon name="clear" size={16} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        tap();
        onPress();
      }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  marginLabel: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.xl + 2, marginTop: space.xxl, marginBottom: space.s },
  card: { marginHorizontal: space.l, borderRadius: radius.m, borderWidth: HAIRLINE, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, paddingVertical: 13, minHeight: 50 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, minHeight: 52, borderRadius: radius.m, paddingHorizontal: space.xl },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: HAIRLINE },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 9, borderRadius: 999 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: HAIRLINE },
});
