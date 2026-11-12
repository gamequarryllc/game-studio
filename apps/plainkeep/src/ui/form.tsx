import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';

import { tap } from '@/platform/haptics';

import { Icon } from './Icon';
import { NO_OUTLINE, radius, space, type, useTheme } from './theme';

// The pieces of a form: a label on the left, what you type on the right.

export function FormRow({ label, children, error, hint, testID }: { label: string; children: ReactNode; error?: string | null; hint?: string | null; testID?: string }) {
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
      ) : hint ? (
        <Text style={[type.footnote, { color: c.ink2, paddingBottom: 4 }]}>{hint}</Text>
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
}: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; error?: string | null; suffix?: string; testID?: string } & Omit<
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
        selectionColor={c.blue}
        style={[type.body, styles.input, NO_OUTLINE, { color: c.ink }]}
        {...input}
      />
      {suffix ? (
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

export function SwitchRow({ label, value, onChange, hint, testID }: { label: string; value: boolean; onChange: (on: boolean) => void; hint?: string | null; testID?: string }) {
  const { c } = useTheme();
  return (
    <FormRow label={label} hint={hint}>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={(on) => {
          tap();
          onChange(on);
        }}
        trackColor={{ true: c.button, false: c.sunk }}
        {...(Platform.OS === 'web' ? { activeThumbColor: '#fff' } : {})}
      />
    </FormRow>
  );
}

/** Two or three choices side by side, like the iPhone's segmented control. */
export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.sunk }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={testID ? `${testID}-${o.key}` : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.key);
            }}
            style={[styles.segment, on ? { backgroundColor: c.raised } : null]}>
            <Text style={[type.subhead, { color: c.ink, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: space.l },
  rowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 },
  input: { flex: 1, textAlign: 'right', paddingVertical: 6, minWidth: 60 },
  segmented: { flexDirection: 'row', borderRadius: radius.m, padding: 2, marginHorizontal: space.l, marginVertical: space.s },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.m - 2, paddingHorizontal: space.s },
});
