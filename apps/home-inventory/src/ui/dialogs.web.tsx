import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HAIRLINE, NO_OUTLINE, space, type, useTheme } from './theme';

// The web preview's stand-in for the iPhone's alerts and action sheets.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  cancelLabel?: string;
}

export interface Choice<T extends string> {
  key: T;
  label: string;
  destructive?: boolean;
}

type Request =
  | { kind: 'alert'; title: string; message?: string; buttons: { label: string; value: string; destructive?: boolean; bold?: boolean }[] }
  | { kind: 'sheet'; title?: string; message?: string; choices: Choice<string>[] }
  | { kind: 'ask'; title: string; message?: string; placeholder?: string; initial: string; confirmLabel: string };

let current: { id: number; request: Request; resolve: (value: string | null) => void } | null = null;
const listeners = new Set<() => void>();
let serial = 0;

function open(request: Request): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    serial += 1;
    current = { id: serial, request, resolve };
    listeners.forEach((l) => l());
  });
}

function close(value: string | null) {
  const c = current;
  current = null;
  listeners.forEach((l) => l());
  c?.resolve(value);
}

export async function confirm(opts: ConfirmOptions): Promise<boolean> {
  const answer = await open({
    kind: 'alert',
    title: opts.title,
    message: opts.message,
    buttons: [
      { label: opts.cancelLabel ?? 'Cancel', value: 'cancel' },
      { label: opts.confirmLabel, value: 'ok', destructive: opts.destructive, bold: !opts.destructive },
    ],
  });
  return answer === 'ok';
}

export async function notify(title: string, message?: string): Promise<void> {
  await open({ kind: 'alert', title, message, buttons: [{ label: 'OK', value: 'ok', bold: true }] });
}

export async function choose<T extends string>(opts: { title?: string; message?: string; choices: Choice<T>[] }): Promise<T | null> {
  return (await open({ kind: 'sheet', title: opts.title, message: opts.message, choices: opts.choices })) as T | null;
}

export function ask(opts: { title: string; message?: string; placeholder?: string; initial?: string; confirmLabel: string }): Promise<string | null> {
  return open({ kind: 'ask', title: opts.title, message: opts.message, placeholder: opts.placeholder, initial: opts.initial ?? '', confirmLabel: opts.confirmLabel });
}

type Colors = ReturnType<typeof useTheme>['c'];

function AlertBox({ request, c }: { request: Exclude<Request, { kind: 'sheet' }>; c: Colors }) {
  const [text, setText] = useState(request.kind === 'ask' ? request.initial : '');
  const buttons =
    request.kind === 'ask'
      ? [
          { label: 'Cancel', value: null as string | null, bold: false, destructive: false },
          { label: request.confirmLabel, value: '__text__', bold: true, destructive: false },
        ]
      : request.buttons.map((b) => ({ label: b.label, value: b.value === 'cancel' ? null : b.value, bold: !!b.bold, destructive: !!b.destructive }));
  return (
    <View style={[StyleSheet.absoluteFill, styles.alertWrap, { backgroundColor: c.scrim }]} testID="dialog">
      <View style={[styles.alert, { backgroundColor: c.card }]} accessibilityRole="alert">
        <View style={styles.alertBody}>
          <Text style={[type.headline, { color: c.ink, textAlign: 'center' }]}>{request.title}</Text>
          {request.message ? <Text style={[type.footnote, { color: c.ink, textAlign: 'center', marginTop: 4 }]}>{request.message}</Text> : null}
          {request.kind === 'ask' ? (
            <TextInput
              testID="dialog-input"
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder={request.placeholder}
              placeholderTextColor={c.ink3}
              onSubmitEditing={() => close(text)}
              style={[type.body, styles.input, NO_OUTLINE, { color: c.ink, backgroundColor: c.sunk }]}
            />
          ) : null}
        </View>
        <View style={[styles.alertButtons, { borderTopColor: c.rule }]}>
          {buttons.map((b, i) => (
            <Pressable
              key={b.label}
              testID={b.value === null ? 'dialog-cancel' : 'dialog-confirm'}
              accessibilityRole="button"
              onPress={() => close(b.value === '__text__' ? text : b.value)}
              style={[styles.alertButton, i > 0 ? { borderLeftWidth: HAIRLINE, borderLeftColor: c.rule } : null]}>
              <Text style={[type.body, { color: b.destructive ? c.red : c.green, fontWeight: b.bold ? '600' : '400' }]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export function DialogHost() {
  const { c } = useTheme();
  const active = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const request = active?.request;
  if (!request) return null;

  if (request.kind === 'sheet') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.sheetWrap, { backgroundColor: c.scrim }]} testID="dialog">
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(null)} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          {request.title || request.message ? (
            <View style={styles.sheetHead}>
              {request.title ? <Text style={[type.footnote, { color: c.ink2, fontWeight: '600', textAlign: 'center' }]}>{request.title}</Text> : null}
              {request.message ? <Text style={[type.footnote, { color: c.ink2, textAlign: 'center' }]}>{request.message}</Text> : null}
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 380 }}>
            {request.choices.map((ch) => (
              <Pressable key={ch.key} testID={`choice-${ch.key}`} accessibilityRole="button" onPress={() => close(ch.key)} style={[styles.sheetRow, { borderTopColor: c.rule }]}>
                <Text style={[type.body, { color: ch.destructive ? c.red : c.green, textAlign: 'center' }]}>{ch.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Pressable testID="dialog-cancel" accessibilityRole="button" onPress={() => close(null)} style={[styles.sheet, styles.sheetCancel, { backgroundColor: c.card }]}>
          <Text style={[type.headline, { color: c.green, textAlign: 'center' }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // A fresh box for each question, so a new one never starts with the last one's text.
  return <AlertBox key={active.id} request={request} c={c} />;
}

const styles = StyleSheet.create({
  alertWrap: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, zIndex: 100 },
  alert: { width: '100%', maxWidth: 290, borderRadius: 16, overflow: 'hidden' },
  alertBody: { padding: space.xl, paddingBottom: space.l },
  alertButtons: { flexDirection: 'row', borderTopWidth: HAIRLINE },
  alertButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  input: { marginTop: space.m, borderRadius: 8, paddingHorizontal: space.m, height: 38 },
  sheetWrap: { justifyContent: 'flex-end', padding: space.s, paddingBottom: space.l, zIndex: 100 },
  sheet: { borderRadius: 14, overflow: 'hidden' },
  sheetHead: { padding: space.m, gap: 2 },
  sheetRow: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderTopWidth: HAIRLINE, paddingHorizontal: space.l },
  sheetCancel: { marginTop: space.s, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
});
