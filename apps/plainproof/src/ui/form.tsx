import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { centsToInput, parseMoney, tidyMoneyInput } from '@/domain/money';
import type { Photo } from '@/domain/types';
import { tap } from '@/platform/haptics';

import { ask } from './dialogs';

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

/**
 * Text that is saved as it is typed. What is typed is kept as typed; the saved copy is tidied (trimmed) on every key,
 * and showing that copy back would swallow each space the moment it was typed. A change from outside (another place
 * opened, a backup restored) is shown instead.
 */
export function useLiveText(stored: string): [string, (text: string) => void] {
  const [typed, setTyped] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (stored !== typed.trim()) setTyped(stored);
  }
  return [typed, setTyped];
}

export function LiveTextRow({ stored, onType, ...row }: { stored: string; onType: (text: string) => void } & Omit<ComponentProps<typeof TextRow>, 'value' | 'onChangeText'>) {
  const [typed, setTyped] = useLiveText(stored);
  return (
    <TextRow
      {...row}
      value={typed}
      onChangeText={(text) => {
        setTyped(text);
        onType(text);
      }}
    />
  );
}

/**
 * An amount saved as it is typed (when it reads as an amount). Empty means none. The text is tidied when the
 * person moves on, and a change from outside is shown instead.
 */
export function MoneyRow({ label, cents, onChange, currency, placeholder, testID }: { label: string; cents: number | null; onChange: (cents: number | null) => void; currency: string; placeholder: string; testID?: string }) {
  const shown = tidyMoneyInput(centsToInput(cents));
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(cents);
  if (cents !== seen) {
    setSeen(cents);
    const parsed = parseMoney(text);
    if (!parsed.ok || parsed.cents !== cents) setText(shown);
  }
  const parsed = parseMoney(text);
  const error = text === '' || parsed.ok ? null : parsed.reason === 'too-large' ? 'That is more than the app can hold.' : 'Enter an amount, like 300,000';
  return (
    <TextRow
      testID={testID}
      label={label}
      value={text}
      onChangeText={(t) => {
        setText(t);
        const p = parseMoney(t);
        if (p.ok && p.cents !== cents) {
          setSeen(p.cents);
          onChange(p.cents);
        }
      }}
      onBlur={() => setText((t) => tidyMoneyInput(t))}
      placeholder={placeholder}
      suffix={currency}
      keyboardType="decimal-pad"
      error={error}
    />
  );
}

/** Several lines of text inside a card, saved as typed. */
export function LiveTextArea({ stored, onType, placeholder, label, maxLength, testID }: { stored: string; onType: (text: string) => void; placeholder: string; label: string; maxLength: number; testID?: string }) {
  const { c } = useTheme();
  const [typed, setTyped] = useLiveText(stored);
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      value={typed}
      onChangeText={(text) => {
        setTyped(text);
        onType(text);
      }}
      placeholder={placeholder}
      placeholderTextColor={c.ink3}
      selectionColor={c.green}
      multiline
      maxLength={maxLength}
      style={[type.body, NO_OUTLINE, { color: c.ink, minHeight: 88, padding: space.l, textAlignVertical: 'top' }]}
    />
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
      {/* Tapping the number lets a big count (40 books, 120 records) be typed instead of tapped out. */}
      <Pressable
        testID={testID ? `${testID}-type` : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${value}. Tap to type a number`}
        hitSlop={8}
        onPress={async () => {
          const typed = await ask({ title: 'How many?', initial: String(value), placeholder: `${min} to ${max}`, confirmLabel: 'Done' });
          if (typed === null) return;
          const n = Number.parseInt(typed.replace(/[^\d]/g, ''), 10);
          if (Number.isFinite(n)) onChange(Math.min(Math.max(n, min), max));
        }}>
        <Text testID={testID} style={[type.body, type.tabular, { color: c.green, minWidth: 24, textAlign: 'right', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}>
          {value}
        </Text>
      </Pressable>
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
