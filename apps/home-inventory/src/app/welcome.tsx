import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUGGESTED_ROOMS, addRooms, setOnboarded } from '@/domain/actions';
import { FREE_ITEM_LIMIT } from '@/domain/limits';
import { success, tap } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import { Icon, type IconName } from '@/ui/Icon';
import { Button } from '@/ui/kit';
import { HAIRLINE, space, type, useTheme } from '@/ui/theme';

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'addPhoto', title: 'One thing at a time', body: 'Photograph it, note the serial number and what it would cost to replace.' },
  { icon: 'report', title: 'A report your insurer can use', body: 'Room by room, with photos and totals, as a PDF you can send or print.' },
  { icon: 'lock', title: 'Kept on this iPhone', body: 'No account and nothing uploaded. You decide where backups go.' },
];

const PRESELECTED = new Set(['Living room', 'Kitchen', 'Bedroom', 'Bathroom']);

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const doc = useDoc();
  const [step, setStep] = useState<'intro' | 'rooms'>('intro');
  const [picked, setPicked] = useState<Set<string>>(PRESELECTED);

  if (doc.meta.onboarded) return <Redirect href="/" />;

  const toggle = (name: string) => {
    tap();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const finish = () => {
    const seeds = SUGGESTED_ROOMS.filter((r) => picked.has(r.name));
    store.update((d, now) => setOnboarded(addRooms(d, seeds, now)));
    success();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView
        testID={`welcome-${step}`}
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: space.xxl, paddingBottom: space.xxl }}>
        {step === 'intro' ? (
          <>
            <Text style={[type.caption, styles.kicker, { color: c.green }]}>Roomfile</Text>
            <Text accessibilityRole="header" style={[type.largeTitle, styles.title, { color: c.ink }]}>
              Know what you own, before you need to.
            </Text>
            <Text style={[type.body, { color: c.ink2, marginTop: space.m }]}>
              After a fire, a flood or a break-in, an insurer asks for a list of everything. This is where you keep it.
            </Text>
            <View style={{ marginTop: space.xxl, gap: space.xl }}>
              {POINTS.map((p) => (
                <View key={p.title} style={styles.point}>
                  <View style={[styles.pointIcon, { backgroundColor: c.greenSoft }]}>
                    <Icon name={p.icon} size={19} color={c.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: c.ink }]}>{p.title}</Text>
                    <Text style={[type.subhead, { color: c.ink2, marginTop: 2 }]}>{p.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[type.largeTitle, styles.title, { color: c.ink }]}>
              Which rooms do you have?
            </Text>
            <Text style={[type.body, { color: c.ink2, marginTop: space.m }]}>
              Pick a few to start. You can rename them and add more later.
            </Text>
            <View style={styles.rooms}>
              {SUGGESTED_ROOMS.map((r) => {
                const on = picked.has(r.name);
                return (
                  <Pressable
                    key={r.name}
                    testID={`pick-${r.name}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(r.name)}
                    style={[styles.room, { backgroundColor: on ? c.greenSoft : c.card, borderColor: on ? c.green : c.rule }]}>
                    <Icon name={r.icon} size={18} color={on ? c.green : c.ink2} />
                    <Text style={[type.callout, { color: on ? c.green : c.ink, fontWeight: on ? '600' : '400', flex: 1 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {on ? <Icon name="check" size={15} color={c.green} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l, borderTopColor: c.rule, backgroundColor: c.paper }]}>
        {step === 'intro' ? (
          <>
            <Button testID="welcome-continue" label="Set up my rooms" onPress={() => setStep('rooms')} />
            <Text style={[type.footnote, { color: c.ink2, textAlign: 'center', marginTop: space.m }]}>
              Free for your first {FREE_ITEM_LIMIT} items, with every feature. One payment removes the limit.
            </Text>
          </>
        ) : (
          <>
            <Button
              testID="welcome-finish"
              label={picked.size === 0 ? 'Pick at least one room' : picked.size === 1 ? 'Start with 1 room' : `Start with ${picked.size} rooms`}
              disabled={picked.size === 0}
              onPress={finish}
            />
            <Button label="Back" kind="plain" onPress={() => setStep('intro')} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' },
  title: { marginTop: space.s },
  point: { flexDirection: 'row', gap: space.l, alignItems: 'flex-start' },
  pointIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rooms: { marginTop: space.xl, gap: space.s },
  room: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: space.l },
  footer: { paddingHorizontal: space.xxl, paddingTop: space.l, borderTopWidth: HAIRLINE },
});
