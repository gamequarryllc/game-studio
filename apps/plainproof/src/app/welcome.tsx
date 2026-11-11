import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUGGESTED_ROOMS, addRooms, setOnboarded } from '@/domain/actions';
import { FREE_ITEM_LIMIT } from '@/domain/limits';
import { success, tap } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import { Icon, type IconName } from '@/ui/Icon';
import { WelcomeArt } from '@/ui/WelcomeArt';
import { Button } from '@/ui/kit';
import { HAIRLINE, display, space, type, useTheme } from '@/ui/theme';

/** What the app does, in three words. The picture above them carries the rest. */
const STEPS: readonly { icon: IconName; word: string }[] = [
  { icon: 'addPhoto', word: 'Photo' },
  { icon: 'tag', word: 'Value' },
  { icon: 'report', word: 'Report' },
];

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
        // On a tall phone the first screen sits in the middle of the space above the button instead of leaving a gap under it.
        contentContainerStyle={[
          { paddingTop: insets.top + (compact ? 16 : 28), paddingHorizontal: space.xxl, paddingBottom: compact ? space.l : space.xxl },
          step === 'intro' ? styles.centered : null,
        ]}>
        {step === 'intro' ? (
          <>
            <Text style={[styles.wordmark, { color: c.green }]}>Plainproof</Text>
            <View style={[styles.art, compact ? styles.artCompact : null]}>
              <WelcomeArt />
            </View>
            <Text accessibilityRole="header" style={[type.largeTitle, styles.title, compact ? styles.titleCompact : null, { color: c.ink }]}>
              Know what you own, before you need to.
            </Text>
            <View style={styles.steps} accessible accessibilityLabel="Photograph it, put a value on it, and the report is ready.">
              {STEPS.map((s, i) => (
                <View key={s.word} style={styles.step}>
                  {i > 0 ? <Icon name="chevron" size={11} color={c.ink3} style={styles.stepArrow} /> : null}
                  <Icon name={s.icon} size={17} color={c.green} />
                  <Text style={[type.callout, { color: c.ink, fontWeight: '600' }]}>{s.word}</Text>
                </View>
              ))}
            </View>
            <View testID="welcome-promise" style={styles.promise}>
              <Icon name="lock" size={14} color={c.ink2} />
              <Text style={[type.subhead, { color: c.ink2 }]}>No account. Nothing is uploaded.</Text>
            </View>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[type.largeTitle, styles.title, { color: c.ink }]}>
              Which rooms do you have?
            </Text>
            <Text style={[type.body, { color: c.ink2, marginTop: space.s }]}>You can change these later.</Text>
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
                    <Icon name={r.icon} size={26} color={on ? c.green : c.ink2} />
                    <Text style={[type.subhead, styles.roomName, { color: on ? c.green : c.ink, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {on ? (
                      <View style={[styles.roomCheck, { backgroundColor: c.green }]}>
                        <Icon name="check" size={11} color={c.onGreen} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <View testID="welcome-footer" style={[styles.footer, { paddingBottom: insets.bottom + space.l, borderTopColor: c.rule, backgroundColor: c.paper }]}>
        {step === 'intro' ? (
          <>
            <Button testID="welcome-continue" label="Set up my rooms" onPress={() => setStep('rooms')} />
            <Text style={[type.footnote, { color: c.ink2, textAlign: 'center', marginTop: space.m }]}>
              Free for your first {FREE_ITEM_LIMIT} items.
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
  centered: { flexGrow: 1, justifyContent: 'center' },
  wordmark: { fontFamily: display.semibold, fontSize: 21, lineHeight: 26, letterSpacing: -0.1 },
  // The picture is a little wider than the text column, so the folder reads as the main thing on the screen.
  art: { marginTop: space.l, marginHorizontal: -space.m },
  artCompact: { marginTop: space.s, marginHorizontal: space.l },
  title: { marginTop: space.l },
  titleCompact: { marginTop: space.m, fontSize: 28, lineHeight: 33 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: space.l, rowGap: space.s },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepArrow: { marginHorizontal: space.s },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.m },
  rooms: { marginTop: space.xl, flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  // Two tiles to a row: the gap is taken off the pair, so they share the width exactly.
  room: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 6, height: 78, borderRadius: 14, borderWidth: 1, paddingHorizontal: space.s },
  roomName: { textAlign: 'center', alignSelf: 'stretch' },
  roomCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.xxl, paddingTop: space.l, borderTopWidth: HAIRLINE },
});
