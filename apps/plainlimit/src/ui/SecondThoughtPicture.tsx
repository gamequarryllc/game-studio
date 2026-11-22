import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { OpenChoice } from '@/domain/askFirst';

import { c } from './theme';

// Second thought in one picture (Settings > Advanced > Second thought): a
// small phone showing the screen an app on the list puts up (the same words,
// hand and buttons as `askShieldCopy` and the shield look in
// src/platform/askFirst.ts), beside three short lines: it asks first, one
// sum, then it opens for the chosen minutes (or while it is used, with
// "While I use it") and asks again. The owner, 2026-11-21: the screen had no
// visual of how it works, and was mostly words; of three mock-ups they picked
// this one as the clearest.

type Glyph = 'hand.raised' | 'plus' | 'timer';

export function SecondThoughtPicture({ open, accent }: { open: OpenChoice; accent: string }) {
  const use = open === 'use';
  const { width } = useWindowDimensions();
  // The phone takes about two fifths of the card, so the lines beside it still fit on a small iPhone.
  const phoneW = Math.max(108, Math.min(140, Math.round((width - 72) * 0.42)));
  const k = phoneW / 140;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={use ? 'Your app asks first. Solve one sum. It stays open while you use it, then it asks again.' : `Your app asks first. Solve one sum. It opens for ${open} minutes, then it asks again.`}
      style={styles.card}>
      <View style={[styles.phone, { width: phoneW, height: phoneW * 1.62, borderRadius: 24 * k, padding: 5 * k }]}>
        <View style={[styles.screen, { borderRadius: 19 * k, paddingTop: 30 * k, paddingHorizontal: 10 * k, paddingBottom: 10 * k }]}>
          <View style={[styles.island, { top: 7 * k, width: 40 * k, height: 11 * k, borderRadius: 6 * k }]} />
          <Icon name="hand.raised" size={34 * k} color={c.ink} />
          <Text style={[styles.shieldTitle, { fontSize: 13 * k, lineHeight: 16 * k, marginTop: 10 * k }]}>Second thought</Text>
          <Text style={[styles.shieldLine, { fontSize: 9.5 * k, lineHeight: 12.5 * k, marginTop: 5 * k }]}>
            {use ? 'One sum, then your app opens while you use it.' : `One sum, then your app opens for ${open} minutes.`}
          </Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.shieldButton, { height: 28 * k, borderRadius: 9 * k }]}>
            <Text style={[styles.shieldButtonText, { fontSize: 10.5 * k }]}>Not now</Text>
          </View>
          <Text style={[styles.shieldSecond, { fontSize: 10.5 * k, lineHeight: 24 * k, marginTop: 2 * k }]}>Solve one sum</Text>
        </View>
      </View>

      <View style={styles.lines}>
        <Line glyph="hand.raised" words="Your app asks first" />
        <Line glyph="plus" words="Solve one sum" />
        <Line glyph="timer" words={use ? 'Open while you use it, then it asks again' : `Open ${open} min, then it asks again`} tint={accent} />
      </View>
    </View>
  );
}

function Line({ glyph, words, tint = c.ink }: { glyph: Glyph; words: string; tint?: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.dot}>
        <Icon name={glyph} size={17} color={tint} />
      </View>
      <Text style={styles.words}>{words}</Text>
    </View>
  );
}

/** Apple's own symbol on an iPhone (the real screen shows hand.raised); a drawn stand-in in the web preview. */
function Icon({ name, size, color }: { name: Glyph; size: number; color: string }) {
  return <SymbolView name={name} size={size} tintColor={color} weight="medium" fallback={<Drawn name={name} size={size} color={color} />} />;
}

function Drawn({ name, size, color }: { name: Glyph; size: number; color: string }) {
  const s = size / 24;
  if (name === 'plus') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: 15 * s, height: 2.6 * s, borderRadius: 1.3 * s, backgroundColor: color }} />
        <View style={{ position: 'absolute', width: 2.6 * s, height: 15 * s, borderRadius: 1.3 * s, backgroundColor: color }} />
      </View>
    );
  }
  if (name === 'timer') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ position: 'absolute', top: 1 * s, width: 6 * s, height: 2.4 * s, borderRadius: 1.2 * s, backgroundColor: color }} />
        <View style={{ width: 17 * s, height: 17 * s, borderRadius: 8.5 * s, borderWidth: 2.3 * s, borderColor: color, marginBottom: 1.5 * s, alignItems: 'center' }}>
          <View style={{ width: 2.3 * s, height: 6 * s, marginTop: 2.5 * s, borderRadius: 1.2 * s, backgroundColor: color }} />
        </View>
      </View>
    );
  }
  // A raised hand: four fingers over a palm, and a thumb.
  const finger = (h: number, up: number) => <View style={{ width: 3.6 * s, height: h * s, marginTop: up * s, borderRadius: 1.8 * s, backgroundColor: color }} />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 0.8 * s, marginTop: 1 * s, marginLeft: 3 * s }}>
        {finger(10, 2)}
        {finger(12, 0)}
        {finger(11.5, 0.5)}
        {finger(9.5, 2.5)}
      </View>
      <View style={{ width: 16.5 * s, height: 10 * s, marginTop: -2 * s, marginLeft: 3 * s, borderTopLeftRadius: 2 * s, borderTopRightRadius: 2 * s, borderBottomLeftRadius: 6 * s, borderBottomRightRadius: 6 * s, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 2.5 * s, top: 10 * s, width: 3.6 * s, height: 8 * s, borderRadius: 1.8 * s, backgroundColor: color, transform: [{ rotate: '-35deg' }] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  phone: { backgroundColor: '#000000', borderWidth: 1.5, borderColor: '#34373C' },
  // The real screen's colours (askFirst.ts: background #15181A, light words, a light button).
  screen: { flex: 1, backgroundColor: '#15181A', alignItems: 'center' },
  island: { position: 'absolute', alignSelf: 'center', backgroundColor: '#000000' },
  shieldTitle: { fontWeight: '700', color: c.ink, textAlign: 'center' },
  shieldLine: { color: c.ink2, textAlign: 'center' },
  shieldButton: { alignSelf: 'stretch', backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' },
  shieldButtonText: { fontWeight: '600', color: c.onPaper },
  shieldSecond: { fontWeight: '600', color: c.ink },
  lines: { flex: 1, gap: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.ground, borderWidth: 1.5, borderColor: c.rule, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, fontSize: 15, lineHeight: 19, fontWeight: '500', color: c.ink2 },
});
