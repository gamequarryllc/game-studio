import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c, display } from './theme';

// Second thought in one picture (Settings > Advanced > Second thought): an app
// that asks first, one sum, the app open for the chosen minutes, and a dashed
// arrow back to the start, since it asks again after that. Drawn with plain
// views so it needs no image files. The owner, 2026-11-21: the screen had no
// visual of how it works, and was mostly words.

export function SecondThoughtPicture({ openMinutes, accent }: { openMinutes: number; accent: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`You open an app. Solve one sum. It opens for ${openMinutes} minutes, then it asks again.`}
      style={styles.card}>
      <View style={styles.steps}>
        <Step words={'You open\nan app'}>
          <View>
            <AppTile muted />
            <View style={styles.lockBadge}>
              <Lock />
            </View>
          </View>
        </Step>
        <Arrow />
        <Step words={'Solve\none sum'}>
          <View style={styles.sum}>
            <Text style={styles.sumText}>47 + 38</Text>
            <Text style={[styles.sumAnswer, { color: accent }]}>= 85 ✓</Text>
          </View>
        </Step>
        <Arrow />
        <Step words={`It opens\nfor ${openMinutes} min`}>
          <View>
            <AppTile />
            <View style={[styles.timer, { backgroundColor: accent }]}>
              <Text style={styles.timerText}>{`${openMinutes}:00`}</Text>
            </View>
          </View>
        </Step>
      </View>

      {/* The way back: the bottom half of a dashed rounded box, from the third step to the first, with an arrowhead up. */}
      <View style={styles.loopRow}>
        <View style={{ flex: 2 }} />
        <View style={{ flex: 10 }}>
          <View style={styles.loopClip}>
            <View style={styles.loop} />
          </View>
          <View style={styles.loopHead} />
          <View style={styles.loopWords}>
            <Text style={styles.loopText}>then it asks again</Text>
          </View>
        </View>
        <View style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function Step({ words, children }: { words: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.art}>{children}</View>
      <Text style={styles.words}>{words}</Text>
    </View>
  );
}

function Arrow() {
  return (
    <View style={styles.arrow}>
      <View style={styles.arrowLine} />
      <View style={styles.arrowHead} />
    </View>
  );
}

/** A look-alike app: a blue tile with a feed on it. Muted while it waits for the sum. */
function AppTile({ muted = false }: { muted?: boolean }) {
  return (
    <View style={[styles.tile, { backgroundColor: muted ? '#4F5B6B' : '#3A8DF5' }]}>
      <View style={[styles.feedTop, muted ? styles.feedMuted : null]} />
      <View style={[styles.feedMid, muted ? styles.feedMuted : null]} />
      <View style={[styles.feedEnd, muted ? styles.feedMuted : null]} />
    </View>
  );
}

function Lock() {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.shackle} />
      <View style={styles.lockBody} />
    </View>
  );
}

const TILE = 52;
const LOOP_H = 24;

const styles = StyleSheet.create({
  card: { borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, paddingTop: 20, paddingBottom: 14, paddingHorizontal: 8 },
  steps: { flexDirection: 'row', alignItems: 'flex-start' },
  // Steps and arrows share the width 4 : 1, so the loop below can line up with the first and last step.
  step: { flex: 4, alignItems: 'center', gap: 10 },
  art: { height: 62, alignItems: 'center', justifyContent: 'center' },
  words: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: c.ink2, textAlign: 'center' },
  arrow: { flex: 1, height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  arrowLine: { width: 12, height: 2, borderRadius: 1, backgroundColor: c.outline },
  arrowHead: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: c.outline, transform: [{ rotate: '45deg' }], marginLeft: -7 },
  tile: { width: TILE, height: TILE, borderRadius: TILE * 0.235, justifyContent: 'center', paddingHorizontal: TILE * 0.2, gap: 3 },
  feedTop: { height: 13, borderRadius: 3.5, backgroundColor: '#FFFFFF' },
  feedMid: { height: 5, borderRadius: 2.5, backgroundColor: '#FFFFFF' },
  feedEnd: { height: 4, width: '62%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  feedMuted: { opacity: 0.6 },
  lockBadge: { position: 'absolute', right: -9, top: -9, width: 26, height: 26, borderRadius: 13, backgroundColor: c.ground, borderWidth: 3, borderColor: c.card, alignItems: 'center', justifyContent: 'center' },
  shackle: { width: 8, height: 6, borderWidth: 1.8, borderBottomWidth: 0, borderColor: c.ink, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  lockBody: { width: 11, height: 8, borderRadius: 2, backgroundColor: c.ink },
  sum: { width: 80, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.ground, alignItems: 'center', justifyContent: 'center' },
  sumText: { fontFamily: display.bold, fontSize: 19, lineHeight: 22, letterSpacing: -0.4, color: c.ink },
  sumAnswer: { fontFamily: display.bold, fontSize: 13, lineHeight: 16 },
  timer: { position: 'absolute', bottom: -9, alignSelf: 'center', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 2.5, borderColor: c.card },
  timerText: { fontSize: 12, lineHeight: 14, fontWeight: '700', color: c.onTone },
  loopRow: { flexDirection: 'row', marginTop: 6 },
  loopClip: { height: LOOP_H, overflow: 'hidden' },
  loop: { height: LOOP_H * 2, marginTop: -LOOP_H, borderWidth: 2, borderStyle: 'dashed', borderColor: c.outline, borderRadius: 18 },
  loopHead: { position: 'absolute', left: -4, top: -2, width: 10, height: 10, borderTopWidth: 2, borderLeftWidth: 2, borderColor: c.outline, transform: [{ rotate: '45deg' }] },
  loopWords: { position: 'absolute', left: 0, right: 0, bottom: -8, alignItems: 'center' },
  loopText: { fontSize: 13.5, lineHeight: 17, fontWeight: '500', color: c.ink3, backgroundColor: c.card, paddingHorizontal: 8 },
});
