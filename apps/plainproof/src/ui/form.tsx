import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import type { Photo } from '@/domain/types';
import { tap } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { Thumb } from './kit';
import { HAIRLINE, NO_OUTLINE, radius, space, type, useTheme } from './theme';

// The pieces of a form: a label on the left, what you type on the right.

export function FormRow({ label, children, error, testID }: { label: string; children: ReactNode; error?: string | null; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={{ paddingHorizontal: space.l, paddingVertical: 6 }}>
      <View style={styles.row}>
        <Text style={[type.body, { color: c.ink }]}>{label}</Text>
        <View style={styles.rowRight}>{children}</View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[type.footnote, { color: c.red, textAlign: 'right', paddingBottom: 4 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function TextRow({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  suffix,
  testID,
  ...input
}: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; error?: string | null; /** Shown after what was typed: the currency of an amount. */ suffix?: string; testID?: string } & Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'placeholder' | 'style'
>) {
  const { c } = useTheme();
  return (
    <FormRow label={label} error={error}>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        selectionColor={c.green}
        style={[type.body, styles.input, NO_OUTLINE, { color: c.ink }]}
        {...input}
      />
      {suffix && value !== '' ? (
        <Text testID={testID ? `${testID}-suffix` : undefined} style={[type.body, { color: c.ink2 }]}>
          {suffix}
        </Text>
      ) : null}
    </FormRow>
  );
}

/** A row that shows a choice and opens a list when tapped. */
export function PickRow({ label, value, placeholder, onPress, testID }: { label: string; value: string | null; placeholder: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => (pressed ? { backgroundColor: c.sunk } : null)}>
      <FormRow label={label}>
        <Text style={[type.body, { color: value ? c.ink : c.ink3, textAlign: 'right', flexShrink: 1 }]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={13} color={c.ink3} />
      </FormRow>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = 1, max = 9999, testID }: { value: number; onChange: (n: number) => void; min?: number; max?: number; testID?: string }) {
  const { c } = useTheme();
  const button = (delta: number, icon: IconName, label: string) => {
    const next = value + delta;
    const off = next < min || next > max;
    return (
      <Pressable
        testID={testID ? `${testID}-${delta > 0 ? 'more' : 'less'}` : undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={off}
        hitSlop={6}
        onPress={() => {
          tap();
          onChange(next);
        }}
        style={[styles.step, { opacity: off ? 0.35 : 1 }]}>
        <Icon name={icon} size={15} color={c.ink} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <Text testID={testID} style={[type.body, type.tabular, { color: c.ink, minWidth: 24, textAlign: 'right' }]}>
        {value}
      </Text>
      <View style={[styles.stepper, { backgroundColor: c.sunk }]}>
        {button(-1, 'minus', 'One fewer')}
        <View style={{ width: HAIRLINE, height: 18, backgroundColor: c.ink3 }} />
        {button(1, 'add', 'One more')}
      </View>
    </View>
  );
}

/** A strip of photos with a tile to add another. */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  busy,
  addLabel,
  icon,
  testID,
  max,
}: {
  photos: Photo[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  busy: boolean;
  addLabel: string;
  icon: IconName;
  testID: string;
  max: number;
}) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
      {photos.map((p, index) => (
        <View key={p.id}>
          <Thumb photoId={p.id} size={84} rounded={radius.m} />
          <Pressable
            testID={`${testID}-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
            hitSlop={8}
            onPress={() => {
              tap();
              onRemove(p.id);
            }}
            style={[styles.remove, { backgroundColor: c.ink }]}>
            <Icon name="close" size={11} color={c.paper} />
          </Pressable>
        </View>
      ))}
      {photos.length < max ? (
        <Pressable
          testID={`${testID}-add`}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          disabled={busy}
          onPress={() => {
            tap();
            onAdd();
          }}
          style={({ pressed }) => [styles.addTile, { borderColor: c.ink3, backgroundColor: pressed ? c.sunk : 'transparent', width: photos.length === 0 ? 168 : 84 }]}>
          {busy ? <ActivityIndicator color={c.green} /> : <Icon name={icon} size={22} color={c.green} />}
          {photos.length === 0 ? <Text style={[type.footnote, { color: c.green, fontWeight: '600' }]}>{addLabel}</Text> : null}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: space.l },
  rowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 },
  input: { flex: 1, textAlign: 'right', paddingVertical: 6, minWidth: 60 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, height: 32 },
  step: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center' },
  strip: { gap: space.m, paddingHorizontal: space.xl, paddingTop: 6, paddingBottom: space.xs },
  remove: { position: 'absolute', top: -5, right: -5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  addTile: { height: 84, borderRadius: radius.m, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 5 },
});
