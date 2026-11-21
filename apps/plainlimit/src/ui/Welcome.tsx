import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CELLS } from '@/domain/battery';
import { toneForCells } from '@/domain/tone';

import { Battery } from './Battery';
import { useReducedMotion } from './motion';
import { c } from './theme';

// Setup's first screen as pictures: the big battery runs down cell by cell,
// turns red when it is empty, and fills up again; under it the day is told in
// four small batteries with a few words each. (It was one battery and a
// paragraph over an empty screen; the owner asked for more to look at,
// build 114.)

/** How long each cell lasts in the big battery's loop, and how long it rests when empty and when full. */
const STEP_MS = 700;
const REST_MS = 1800;

/** The big battery, running down and filling up for as long as the screen is open. Still (and full) under Reduce Motion. */
export function DrainingBattery({ height = 84 }: { height?: number }) {
  const reduced = useReducedMotion();
  const [cells, setCells] = useState(CELLS);
  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setCells((n) => (n === 0 ? CELLS : n - 1)), cells === 0 || cells === CELLS ? REST_MS : STEP_MS);
    return () => clearTimeout(timer);
  }, [cells, reduced]);
  const shown = reduced ? CELLS : cells;
  const tone = toneForCells(shown);
  return (
    <View style={[styles.hero, { backgroundColor: tone.bg }]}>
      <Battery cells={shown} tone={tone} height={height} decorative />
    </View>
  );
}

/** The day in four lines, each with its own small battery. `recharge` is the time as the screen says it ("6:00 AM"). */
export function BatteryStory({ recharge }: { recharge: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Line cells={CELLS} words="Starts full every day" />
      <Line cells={2} words="Your apps use it up" />
      <Line cells={0} words="Empty: those apps lock" />
      <Line cells={CELLS} words={`Recharges at ${recharge}`} />
    </View>
  );
}

function Line({ cells, words }: { cells: number; words: string }) {
  const tone = toneForCells(cells);
  return (
    <View style={styles.line}>
      <View style={[styles.tile, { backgroundColor: tone.bg }]}>
        <Battery cells={cells} tone={tone} height={28} flat decorative />
      </View>
      <Text style={styles.words}>{words}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 32, paddingVertical: 26, paddingHorizontal: 22, marginBottom: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // The battery takes the width it is given, so the tile stretches it (centred, it shrank to a stub).
  tile: { width: 112, height: 52, borderRadius: 16, justifyContent: 'center', paddingHorizontal: 12 },
  words: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '600', color: c.ink },
});
