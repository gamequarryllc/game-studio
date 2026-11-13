import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Health } from '@/platform/screenTime';
import { store } from '@/state/store';

import { BigButton } from './kit';
import { c } from './theme';

// Shown on Today when counting is meant to be on but the day is not really
// being counted. Turning counting off on purpose is not shown here; the week
// view marks those days instead.

const COPY: Record<Exclude<Health, 'fine'>, { line: string; button: string }> = {
  accessOff: {
    line: 'Screen Time access for Plainlimit was turned off in the Settings app, so nothing is being counted or locked.',
    button: 'Turn it back on',
  },
  notRegistered: { line: 'The phone stopped counting today, so nothing will lock.', button: 'Count again' },
  miscounted: { line: "The phone miscounted today, so part of it can't lock. Counting again fixes it.", button: 'Count again' },
};

export function CountingProblem({ health }: { health: Health }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (health === 'fine') return null;
  const copy = COPY[health];

  const fix = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = health === 'miscounted' ? ((await store.countAgain()) ? 'on' : 'failed') : await store.resumeCounting();
    setBusy(false);
    if (result === 'denied') setProblem('Access was not given. In the Settings app, open Screen Time and allow Plainlimit, then come back.');
    if (result === 'failed') setProblem('The phone would not start counting. Try again in a moment.');
  };

  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text style={styles.title}>Not counting</Text>
      <Text style={styles.line}>{copy.line}</Text>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <BigButton label={busy ? 'One moment…' : copy.button} onPress={() => void fix()} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderColor: '#F79200', borderRadius: 18, padding: 16, gap: 10 },
  title: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#F7B24D' },
  line: { fontSize: 16, lineHeight: 22, color: c.ink },
  problem: { fontSize: 14, lineHeight: 20, color: c.ink2 },
});
