import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollViewInstance, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRO_FEATURES, proStartIndex } from '@/domain/pro';
import { success, tap } from '@/platform/haptics';
import { EXPECTED_PRICE } from '@/pro/config';
import { storeReadout } from '@/pro/appstore';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { BigButton, IconTile, ProBadge, StatusBand } from '@/ui/kit';
import { PRO_COLOURS, ProCard } from '@/ui/ProPictures';
import { c, display } from '@/ui/theme';

// Plainlimit Pro: what it adds, one payment, and Restore. Each extra is a card
// showing it working; swipe between them, or tap its tile under the cards
// (the owner picked this look, "Peek", on 2026-11-24, over a plain list of
// words). A screen that sends someone here names its extra (`/pro?show=sums`),
// and the cards open on it. The answer to a purchase is said on the screen
// itself, under the buttons, never in a pop-up.

const NO_STORE = DEV_TOOLS
  ? 'Nothing can be bought in this build. To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.'
  : 'Nothing can be bought in this build.';

const GAP = 12;
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
/** On the web preview the cards snap with the browser's own scroll snapping. */
const WEB_SNAP = (Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : {}) as ViewStyle;
const WEB_SNAP_CARD = (Platform.OS === 'web' ? { scrollSnapAlign: 'center' } : {}) as ViewStyle;

export default function ProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { show } = useLocalSearchParams<{ show?: string }>();
  const state = usePro();
  const [said, setSaid] = useState<string | null>(null);
  const [start] = useState(() => proStartIndex(show));
  const [index, setIndex] = useState(start);
  const [width, setWidth] = useState(0);
  const cards = useRef<ScrollViewInstance>(null);
  // The price comes from the App Store. If the phone was offline when the app started, ask again now.
  useEffect(() => {
    void pro.refreshPrice();
  }, []);
  // Where there is a store, only its own price is shown: the draft price would be wrong in another country.
  const price = state.price ?? (state.storeOpen ? null : EXPECTED_PRICE);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // A card a little narrower than the screen, so the next one peeks in at each side.
  const cardW = Math.max(240, Math.min(320, width - 88));
  const cardH = Math.round(Math.max(220, Math.min(380, screenH - 470)));
  const step = cardW + GAP;
  const side = Math.max(0, (width - cardW) / 2);
  // Once the width is known, go to the card asked for (the iPhone starts there already, through contentOffset).
  useEffect(() => {
    if (width > 0 && start > 0) cards.current?.scrollTo({ x: start * step, animated: false });
  }, [width, start, step]);
  const goTo = (i: number) => {
    tap();
    setIndex(i);
    cards.current?.scrollTo({ x: i * step, animated: true });
  };
  const feature = PRO_FEATURES[index] ?? PRO_FEATURES[0];
  const all = COUNT_WORDS[PRO_FEATURES.length] ?? String(PRO_FEATURES.length);

  const buy = async () => {
    if (!state.storeOpen) return setSaid(NO_STORE);
    setSaid(null);
    const result = await pro.buy();
    if (result === 'purchased') {
      success();
      setSaid('Pro is unlocked. Thank you.');
    } else if (result === 'pending') setSaid('Waiting for approval. Pro unlocks on this iPhone as soon as the purchase is approved.');
    else if (result === 'unavailable') setSaid('The App Store couldn’t be reached. Check your connection and try again.');
    else if (result === 'failed') setSaid('The purchase didn’t go through, and you haven’t been charged. Try again in a moment.');
  };

  const restore = async () => {
    if (!state.storeOpen) return setSaid('There is nothing to restore in this build. In the App Store version this brings Pro back on a new iPhone.');
    setSaid(null);
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      setSaid('Pro is back on this iPhone.');
    } else if (result === 'nothing') setSaid('This Apple Account hasn’t bought Plainlimit Pro.');
    else setSaid('The App Store couldn’t be reached. Check your connection and try again.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }}>
        <View testID="pro-screen" style={styles.head}>
          <ProBadge />
          <Text accessibilityRole="header" numberOfLines={1} style={styles.headText}>
            {state.isPro ? 'Pro is unlocked' : 'Plainlimit Pro'}
          </Text>
          {/* Always a way out, also when the screen was opened from the widget and there is nothing to go back to (build 92 had none). */}
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={leave} style={({ pressed }) => [styles.close, pressed ? { opacity: 0.6 } : null]}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={{ height: cardH, marginTop: 18 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <ScrollView
              ref={cards}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={step}
              decelerationRate="fast"
              disableIntervalMomentum
              contentOffset={{ x: start * step, y: 0 }}
              scrollEventThrottle={32}
              onScroll={(e) => {
                const at = Math.round(e.nativeEvent.contentOffset.x / step);
                const next = Math.max(0, Math.min(PRO_FEATURES.length - 1, at));
                if (next !== index) setIndex(next);
              }}
              style={WEB_SNAP}
              contentContainerStyle={{ paddingHorizontal: side, gap: GAP }}>
              {PRO_FEATURES.map((f, i) => (
                <View key={f.key} style={WEB_SNAP_CARD}>
                  <ProCard feature={f.key} width={cardW} height={cardH} dim={i !== index} />
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* The extras' tiles, as in Settings: they show which card this is, and go to any of them. */}
        <View style={styles.tiles}>
          {PRO_FEATURES.map((f, i) => {
            const on = i === index;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityLabel={f.title}
                accessibilityState={{ selected: on }}
                hitSlop={4}
                onPress={() => goTo(i)}
                style={[styles.tile, on ? { borderColor: PRO_COLOURS[f.key] } : { opacity: 0.4 }]}>
                <IconTile icon={{ name: f.key, bg: PRO_COLOURS[f.key] }} size={32} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.words}>
          <Text style={styles.title}>{feature.title}</Text>
          <Text style={styles.line}>{feature.line}</Text>
        </View>

        <View style={{ flex: 1, minHeight: 16 }} />

        <View style={styles.foot}>
          {state.isPro ? (
            <>
              <Text style={styles.small}>Everything here is yours, on this iPhone and any other with your Apple Account.</Text>
              <BigButton label="Done" onPress={leave} />
            </>
          ) : (
            <>
              <BigButton label={state.busy ? 'One moment…' : price ? `Unlock all ${all} · ${price}` : `Unlock all ${all}`} disabled={state.busy} onPress={() => void buy()} />
              <Text style={styles.small}>One payment. No subscription.</Text>
              <View style={styles.links}>
                <TextButton label="Restore purchase" disabled={state.busy} onPress={() => void restore()} />
                <TextButton label="Not now" quiet onPress={leave} />
              </View>
            </>
          )}
          {DEV_TOOLS && state.storeOpen ? <Text style={styles.small}>Test build only. {storeReadout()}</Text> : null}
          {said ? (
            <Text testID="pro-said" accessibilityLiveRegion="polite" style={styles.said}>
              {said}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <StatusBand />
    </View>
  );
}

/** A quiet choice under the main button: words only. */
function TextButton({ label, onPress, quiet = false, disabled = false }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.link, pressed ? { opacity: 0.6 } : null, disabled ? { opacity: 0.4 } : null]}>
      <Text style={[styles.linkText, quiet ? { color: c.ink3 } : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  headText: { flex: 1, fontFamily: display.semi, fontSize: 18, lineHeight: 22, color: c.ink },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
  closeText: { fontSize: 16, fontWeight: '600', color: c.ink },
  tiles: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 20 },
  tile: { padding: 2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  words: { paddingHorizontal: 32, marginTop: 16, alignItems: 'center', gap: 6 },
  title: { fontFamily: display.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: c.ink, textAlign: 'center' },
  line: { fontSize: 16, lineHeight: 22, color: c.ink3, textAlign: 'center', minHeight: 44 },
  foot: { paddingHorizontal: 20, gap: 10 },
  small: { fontSize: 14, lineHeight: 20, color: c.ink3, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  link: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 15.5, fontWeight: '600', color: c.ink2 },
  said: { fontSize: 15, lineHeight: 21, color: c.ink2, textAlign: 'center' },
});
