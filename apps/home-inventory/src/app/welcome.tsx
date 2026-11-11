import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUGGESTED_ROOMS, addRooms, setOnboarded } from '@/domain/actions';
import { FREE_ITEM_LIMIT } from '@/domain/limits';
import { success, tap } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import type { HomeSummary } from '@/domain/selectors';
import { FolderCard } from '@/ui/FolderCard';
import { Icon } from '@/ui/Icon';
import { Button } from '@/ui/kit';
import { HAIRLINE, display, space, type, useTheme } from '@/ui/theme';

/** The folder shown on the first screen: a picture of where this leads, clearly marked as an example. */
// The counts are kept short on purpose: "9 of 12" lets the two meters share a row even on the narrowest iPhone.
const EXAMPLE: HomeSummary = {
  count: 12,
  pieces: 15,
  rooms: 4,
  totalCents: 946000,
  withPhoto: 9,
  withValue: 11,
  withSerial: 5,
  withReceipt: 4,
  missingSerial: 2,
};

const PRESELECTED = new Set(['Living room', 'Kitchen', 'Bedroom', 'Bathroom']);

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const doc = useDoc();
  const [step, setStep] = useState<'intro' | 'rooms'>('intro');
  const [picked, setPicked] = useState<Set<string>>(PRESELECTED);
  // A short screen (an iPhone SE) gets tighter spacing and a slightly smaller headline.
  const compact = useWindowDimensions().height < 720;

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
        contentContainerStyle={{ paddingTop: insets.top + (compact ? 16 : 44), paddingHorizontal: space.xxl, paddingBottom: compact ? space.l : space.xxl }}>
        {step === 'intro' ? (
          <>
            <Text style={[styles.wordmark, { color: c.green }]}>Roomfile</Text>
            <Text accessibilityRole="header" style={[type.largeTitle, styles.title, compact ? styles.titleCompact : null, { color: c.ink }]}>
              Know what you own, before you need to.
            </Text>
            <Text style={[compact ? type.callout : type.body, { color: c.ink2, marginTop: compact ? space.s : space.m }]}>
              After a fire, a flood or a break-in, an insurer asks for a list of everything. Photograph each thing, note its serial number and what it would cost to replace, and the report is ready when you need it.
            </Text>
            <View style={[styles.example, compact ? { marginTop: space.l } : null]}>
              <FolderCard sample label="An example" summary={EXAMPLE} currency={doc.settings.currency} />
            </View>
            <View style={styles.promise}>
              <Icon name="lock" size={15} color={c.ink2} style={{ marginTop: 2 }} />
              <Text style={[type.subhead, { color: c.ink2, flex: 1 }]}>No account, and nothing is uploaded. You decide where reports and backups go.</Text>
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
  wordmark: { fontFamily: display.semibold, fontSize: 21, lineHeight: 26, letterSpacing: -0.1 },
  title: { marginTop: space.m },
  titleCompact: { marginTop: space.s, fontSize: 28, lineHeight: 33 },
  // The folder brings its own side margins; this cancels the screen's, so it is as wide here as on the Rooms tab.
  example: { marginTop: space.xxl, marginHorizontal: -space.xxl },
  promise: { flexDirection: 'row', gap: space.s, marginTop: space.l },
  rooms: { marginTop: space.xl, gap: space.s },
  room: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: space.l },
  footer: { paddingHorizontal: space.xxl, paddingTop: space.l, borderTopWidth: HAIRLINE },
});
