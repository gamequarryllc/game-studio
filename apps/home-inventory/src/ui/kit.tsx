import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoSize } from '@/domain/backup';
import { tap } from '@/platform/haptics';
import { usePhotoUri } from '@/platform/photos';

import { Icon, type IconName } from './Icon';
import { HAIRLINE, TAB_BAR_SPACE, radius, space, type, useTheme } from './theme';

// The small set of pieces every screen is built from.

/** A scrolling tab screen with a large serif title and an optional button beside it. */
export function TabScreen({
  title,
  action,
  children,
  testID,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: c.paper }}
      contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 22 : 10), paddingBottom: TAB_BAR_SPACE }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink, flex: 1 }]} numberOfLines={2}>
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
    <View style={{ flex: 1, backgroundColor: c.paper }}>
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

export function SectionLabel({ children, trailing }: { children: string; trailing?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionLabel}>
      <Text accessibilityRole="header" style={[type.footnote, { color: c.ink2, fontWeight: '600', flex: 1 }]}>
        {children}
      </Text>
      {trailing}
    </View>
  );
}

export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[type.footnote, { color: c.ink2, marginHorizontal: space.xl + space.l, marginTop: space.s }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.rule }, style]}>{children}</View>;
}

export function Divider({ inset = space.l }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: HAIRLINE, backgroundColor: c.rule, marginLeft: inset }} />;
}

/** A list row: something on the left, a title and a line under it, a value and a chevron on the right. */
export function Row({
  title,
  subtitle,
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
  leading?: ReactNode;
  value?: string;
  valueTone?: 'ink' | 'muted' | 'amber';
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  tint?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const titleColor = destructive ? c.red : tint ? c.green : c.ink;
  const valueColor = valueTone === 'amber' ? c.amber : valueTone === 'ink' ? c.ink : c.ink2;
  const body = (
    <View style={styles.row}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { color: titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[type.body, type.tabular, { color: valueColor, marginLeft: space.s }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Icon name="chevron" size={14} color={c.ink3} style={{ marginLeft: 2 }} /> : null}
    </View>
  );
  if (!onPress) return body;
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

/** The rounded square a room's symbol sits in. */
export function IconTile({ name, size = 36 }: { name: IconName; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.52} color={c.green} />
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
  const fg = kind === 'primary' ? c.onGreen : kind === 'danger' ? c.red : c.green;
  const bg = kind === 'primary' ? c.green : kind === 'soft' ? c.greenSoft : 'transparent';
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
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        kind === 'plain' || kind === 'danger' ? { minHeight: 44 } : null,
        style,
      ]}>
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

/** The round button beside a large title. */
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
      style={({ pressed }) => [styles.round, { backgroundColor: c.green, opacity: pressed ? 0.75 : 1 }]}>
      <Icon name={icon} size={20} color={c.onGreen} />
    </Pressable>
  );
}

/** A text button for a navigation bar. */
export function BarButton({ label, onPress, bold, disabled, testID }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} hitSlop={10} onPress={onPress} style={{ paddingHorizontal: Platform.OS === 'web' ? space.l : 0, paddingVertical: 6 }}>
      <Text style={[type.body, { color: disabled ? c.ink3 : c.green, fontWeight: bold ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, count, testID }: { label: string; selected: boolean; onPress: () => void; count?: number; testID?: string }) {
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
      style={[styles.chip, { backgroundColor: selected ? c.ink : c.card, borderColor: selected ? c.ink : c.rule }]}>
      <Text style={[type.subhead, { color: selected ? c.paper : c.ink, fontWeight: selected ? '600' : '400' }]}>{label}</Text>
      {count !== undefined && count > 0 ? (
        <Text style={[type.subhead, type.tabular, { color: selected ? c.paper : c.ink2, opacity: selected ? 0.75 : 1 }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/** A photo from the app's own store, or a quiet placeholder when there isn't one. */
export function Thumb({
  photoId,
  size,
  source = 'thumb',
  rounded = radius.s,
  placeholder = 'photo',
  style,
}: {
  photoId: string | null | undefined;
  size: number;
  source?: PhotoSize;
  rounded?: number;
  placeholder?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const uri = usePhotoUri(photoId, source);
  return (
    <View style={[{ width: size, height: size, borderRadius: rounded, backgroundColor: c.sunk, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <Icon name={placeholder} size={Math.max(16, size * 0.36)} color={c.ink3} />
      )}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.sunk }]}>
        <Icon name={icon} size={26} color={c.ink2} />
      </View>
      <Text style={[type.title, { color: c.ink, textAlign: 'center', fontSize: 22, lineHeight: 28 }]}>{title}</Text>
      <Text style={[type.callout, { color: c.ink2, textAlign: 'center', marginTop: space.s }]}>{body}</Text>
      {action ? <View style={{ marginTop: space.xl, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/** A short notice inside a screen: a gap worth filling, or what the web preview can't do. */
export function Notice({ icon = 'info', tone = 'plain', children }: { icon?: IconName; tone?: 'plain' | 'amber'; children: ReactNode }) {
  const { c } = useTheme();
  const fg = tone === 'amber' ? c.amber : c.ink2;
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'amber' ? c.amberSoft : c.sunk }]}>
      <Icon name={icon} size={16} color={fg} style={{ marginTop: 1 }} />
      <Text style={[type.footnote, { color: tone === 'amber' ? c.amber : c.ink2, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, marginBottom: space.l },
  sectionLabel: { flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: space.xl + space.l, marginTop: space.xxl, marginBottom: space.s },
  card: { marginHorizontal: space.xl, borderRadius: radius.m, borderWidth: HAIRLINE, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 11, minHeight: 48 },
  button: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: space.xl },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 13, height: 34, borderRadius: 17, borderWidth: HAIRLINE },
  empty: { alignItems: 'center', paddingHorizontal: space.huge, paddingTop: space.huge, paddingBottom: space.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.l },
  notice: { flexDirection: 'row', gap: space.s, marginHorizontal: space.xl, marginTop: space.m, padding: space.m, borderRadius: radius.m },
});
