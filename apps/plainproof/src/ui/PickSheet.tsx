import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { HAIRLINE, display, space, type, useTheme } from './theme';

// The app's own sheet for picking one value (a room, a category, a condition): the
// tiles of the welcome screen's room picker, with the current choice marked, instead
// of the system's stack of grey buttons. Menus of actions (rename, delete, take a
// photo) stay the system's own action sheet.

export interface PickChoice<T extends string> {
  key: T;
  label: string;
  /** Choices with a symbol are laid out as tiles, two to a row; without, as a list. */
  icon?: IconName;
  /** A quieter row at the end, such as "No category" or "New room…". */
  quiet?: boolean;
}

interface Request {
  title: string;
  message?: string;
  choices: PickChoice<string>[];
  selected?: string | null;
}

let current: { id: number; request: Request; resolve: (value: string | null) => void } | null = null;
const listeners = new Set<() => void>();
let serial = 0;

// On iPhone a sheet is a presented view controller, and it can only be presented from the screen
// on top: a sheet asked for by the root while the item form (itself presented) is up never appears,
// and the app is left waiting under an invisible sheet. So every presented screen that picks
// mounts its own host, and only the newest mounted host draws.
let hosts: number[] = [];
let hostSerial = 0;

// The answer goes back only once the sheet is gone: an alert asked for straight after (a name for a
// new room) cannot appear while the sheet is still on its way out.
let answer: { resolve: (value: string | null) => void; value: string | null; timer: ReturnType<typeof setTimeout> } | null = null;

function settle() {
  const a = answer;
  answer = null;
  if (!a) return;
  clearTimeout(a.timer);
  a.resolve(a.value);
}

function close(value: string | null) {
  const c = current;
  current = null;
  listeners.forEach((l) => l());
  if (!c) return;
  if (Platform.OS !== 'ios') {
    c.resolve(value);
    return;
  }
  settle();
  // onDismiss says when the sheet has gone; the timer is there in case it never says.
  answer = { resolve: c.resolve, value, timer: setTimeout(settle, 700) };
}

/**
 * Asks for one of `choices`; resolves with its key, or null when the sheet is closed without a pick.
 * A screen presented over the others (presentation 'modal') that calls this must render its own <PickSheetHost />.
 */
export function pick<T extends string>(opts: { title: string; message?: string; choices: PickChoice<T>[]; selected?: T | null }): Promise<T | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    serial += 1;
    current = { id: serial, request: opts as Request, resolve: resolve as (value: string | null) => void };
    listeners.forEach((l) => l());
  });
}

export function PickSheetHost() {
  const [me] = useState(() => ++hostSerial);
  useEffect(() => {
    hosts = [...hosts.filter((h) => h !== me), me];
    listeners.forEach((l) => l());
    return () => {
      hosts = hosts.filter((h) => h !== me);
      // A screen that closes with its sheet open takes the question with it.
      if (current) close(null);
      listeners.forEach((l) => l());
    };
  }, [me]);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const active = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (hosts[hosts.length - 1] === me ? current : null),
    () => null,
  );
  const request = active?.request;
  const main = request ? request.choices.filter((ch) => !ch.quiet) : [];
  const quiet = request ? request.choices.filter((ch) => ch.quiet) : [];
  const tiles = main.length > 0 && main.every((ch) => ch.icon);

  const choose = (key: string) => {
    tap();
    close(key);
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => close(null)} onDismiss={settle} statusBarTranslucent>
      {request ? (
        <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: c.scrim }]} testID="dialog">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close(null)} accessibilityLabel="Close" accessibilityRole="button" />
          <View style={[styles.sheet, { backgroundColor: c.paper, maxHeight: height - insets.top - space.xxl, paddingBottom: insets.bottom + space.m }]} accessibilityViewIsModal>
            <View style={[styles.grabber, { backgroundColor: c.rule }]} />
            <View style={styles.head}>
              <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
                {request.title}
              </Text>
              {request.message ? <Text style={[type.subhead, { color: c.ink2, marginTop: space.xs }]}>{request.message}</Text> : null}
            </View>
            <ScrollView contentContainerStyle={styles.body} bounces={false}>
              {tiles ? (
                <View style={styles.grid}>
                  {main.map((ch) => {
                    const on = ch.key === request.selected;
                    return (
                      <Pressable
                        key={ch.key}
                        testID={`choice-${ch.key}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => choose(ch.key)}
                        style={({ pressed }) => [styles.tile, { backgroundColor: on ? c.greenSoft : c.card, borderColor: on ? c.green : c.rule, opacity: pressed ? 0.7 : 1 }]}>
                        <Icon name={ch.icon as IconName} size={24} color={on ? c.green : c.ink2} />
                        <Text style={[type.subhead, styles.tileLabel, { color: on ? c.green : c.ink, fontWeight: on ? '600' : '400' }]} numberOfLines={2}>
                          {ch.label}
                        </Text>
                        {on ? (
                          <View style={[styles.badge, { backgroundColor: c.green }]}>
                            <Icon name="check" size={11} color={c.onGreen} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : main.length > 0 ? (
                <View style={[styles.list, { backgroundColor: c.card, borderColor: c.rule }]}>
                  {main.map((ch, i) => {
                    const on = ch.key === request.selected;
                    return (
                      <Pressable
                        key={ch.key}
                        testID={`choice-${ch.key}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => choose(ch.key)}
                        style={({ pressed }) => [styles.row, i > 0 ? { borderTopWidth: HAIRLINE, borderTopColor: c.rule } : null, { backgroundColor: pressed ? c.sunk : 'transparent' }]}>
                        {ch.icon ? <Icon name={ch.icon} size={20} color={on ? c.green : c.ink2} /> : null}
                        <Text style={[type.body, { flex: 1, color: on ? c.green : c.ink, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>
                          {ch.label}
                        </Text>
                        {on ? <Icon name="check" size={17} color={c.green} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {quiet.map((ch) => {
                const on = ch.key === request.selected;
                return (
                  <Pressable
                    key={ch.key}
                    testID={`choice-${ch.key}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => choose(ch.key)}
                    style={({ pressed }) => [styles.quiet, { borderColor: on ? c.green : c.rule, opacity: pressed ? 0.7 : 1 }]}>
                    {ch.icon ? <Icon name={ch.icon} size={18} color={c.green} /> : null}
                    <Text style={[type.callout, { color: c.green, fontWeight: '600' }]}>{ch.label}</Text>
                    {on ? <Icon name="check" size={15} color={c.green} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable testID="dialog-cancel" accessibilityRole="button" onPress={() => close(null)} style={styles.cancel}>
              <Text style={[type.headline, { color: c.green }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: space.s },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: space.m },
  head: { paddingHorizontal: space.xxl, paddingBottom: space.l },
  title: { fontFamily: display.semibold, fontSize: 24, lineHeight: 29, letterSpacing: -0.2 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.s, gap: space.s },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  // Two to a row, as on the welcome screen.
  tile: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 78, borderRadius: 14, borderWidth: 1, paddingHorizontal: space.s, paddingVertical: space.m },
  tileLabel: { textAlign: 'center', alignSelf: 'stretch' },
  badge: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: 14, borderWidth: HAIRLINE, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 52, paddingHorizontal: space.l },
  quiet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: space.xs },
});
