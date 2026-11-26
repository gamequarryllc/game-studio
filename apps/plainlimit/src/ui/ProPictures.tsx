import { StyleSheet, Text, View } from 'react-native';

import type { ProFeatureKey } from '@/domain/pro';
import { glowForCells, toneAt } from '@/domain/tone';

import { Battery } from './Battery';
import { FloorPicture } from './FloorPicture';
import { GlowBattery, GlowField } from './GlowBattery';
import { Icon } from './icons';
import { tiles } from './kit';
import { AskPhone } from './SecondThoughtPicture';
import { c, display } from './theme';

// The Pro screen's cards: each extra shown working, in a soft light of the
// colour its tile wears in Settings. The owner picked this look ("Peek") of
// four mock-ups on 2026-11-24: the old screen was a plain list of words.
// Every picture is drawn for a card 300 points wide and 330 tall, and scaled
// to fit the card it is on.

/** The colour of each extra: the same as its tile under Settings > Do more. */
export const PRO_COLOURS: Record<ProFeatureKey, string> = {
  secondThought: tiles.purple,
  pushUps: tiles.green,
  recharge: tiles.orange,
  sums: tiles.pink,
  widget: tiles.blue,
  lockMessage: tiles.teal,
};

/** What each card shows, for screen readers. */
const SPOKEN: Record<ProFeatureKey, string> = {
  secondThought: 'An app on your list asks first: one sum, then it opens for 10 minutes.',
  pushUps: 'Push-ups counted by the camera: 7 of 10, with the phone flat on the floor under your face.',
  recharge: 'The recharge time set to 5:30 AM.',
  sums: 'Sums from easy to hard: 47 plus 8, 47 plus 38, 347 plus 86.',
  widget: 'The large widget: the battery, a 12 day streak, 2 passes saved, 3 perfect weeks and this week.',
  lockMessage: 'A locked app showing your own words: Put it down. Go for a walk.',
};

export function ProCard({ feature, width, height, dim = false }: { feature: ProFeatureKey; width: number; height: number; dim?: boolean }) {
  const k = Math.min(width / 300, height / 330);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={SPOKEN[feature]} style={[styles.card, { width, height, opacity: dim ? 0.55 : 1 }]}>
      <GlowField color={PRO_COLOURS[feature]} width={width} centre={height / 2} reach={height / 2} strength={2} />
      <View style={styles.middle}>{picture(feature, k)}</View>
    </View>
  );
}

function picture(feature: ProFeatureKey, k: number) {
  switch (feature) {
    case 'secondThought':
      return <AskPhone width={Math.round(150 * k)} open={10} />;
    case 'pushUps':
      return <PushUps k={k} />;
    case 'recharge':
      return <Recharge k={k} />;
    case 'sums':
      return <Sums k={k} />;
    case 'widget':
      return <LargeWidget k={k} />;
    case 'lockMessage':
      return <LockedApp k={k} />;
  }
}

/** Push-ups being counted: the number so far, over the phone on the floor under the face. */
function PushUps({ k }: { k: number }) {
  return (
    <View style={{ alignItems: 'center', gap: 14 * k }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 * k }}>
        <Text style={{ fontFamily: display.bold, fontSize: 88 * k, lineHeight: 92 * k, letterSpacing: -3.5 * k, color: '#FFFFFF' }}>7</Text>
        <Text style={{ fontSize: 18 * k, fontWeight: '600', color: c.ink3 }}>of 10</Text>
      </View>
      <FloorPicture accent={PRO_COLOURS.pushUps} k={0.9 * k} />
    </View>
  );
}

/** A sunrise over a wheel of times, stopped on 5:30 AM. */
function Recharge({ k }: { k: number }) {
  const orange = PRO_COLOURS.recharge;
  const row = (time: string, far: boolean) => <Text style={{ fontFamily: display.semi, fontSize: (far ? 15 : 18) * k, lineHeight: 34 * k, color: far ? '#4B5056' : c.ink3 }}>{time}</Text>;
  return (
    <View style={{ alignItems: 'center', gap: 18 * k }}>
      <Icon name="recharge" size={58 * k} color={orange} />
      <View style={{ alignItems: 'center' }}>
        {row('4:30 AM', true)}
        {row('5:00 AM', false)}
        <View style={{ paddingHorizontal: 18 * k, borderRadius: 14 * k, backgroundColor: orange, shadowColor: orange, shadowOpacity: 0.8, shadowRadius: 16 * k, shadowOffset: { width: 0, height: 0 } }}>
          <Text style={{ fontFamily: display.bold, fontSize: 28 * k, lineHeight: 46 * k, color: '#FFFFFF' }}>5:30 AM</Text>
        </View>
        {row('6:00 AM', false)}
        {row('6:30 AM', true)}
      </View>
    </View>
  );
}

/** One sum of each level (as on Settings > Sums), the hard one chosen. */
function Sums({ k }: { k: number }) {
  const pink = PRO_COLOURS.sums;
  const rows: readonly [string, string, boolean][] = [
    ['Easy', '47 + 8', false],
    ['Normal', '47 + 38', false],
    ['Hard', '347 + 86', true],
  ];
  return (
    <View style={{ width: 228 * k, gap: 10 * k }}>
      {rows.map(([level, sum, on]) => (
        <View
          key={level}
          style={[
            { height: 62 * k, borderRadius: 18 * k, paddingHorizontal: 16 * k, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
            on ? { backgroundColor: pink, shadowColor: pink, shadowOpacity: 0.75, shadowRadius: 16 * k, shadowOffset: { width: 0, height: 0 } } : { backgroundColor: c.ground, borderWidth: 1.5, borderColor: c.rule },
          ]}>
          <Text style={{ fontSize: 14 * k, fontWeight: '600', color: on ? '#FFFFFF' : c.ink3 }}>{level}</Text>
          <Text style={{ fontFamily: display.bold, fontSize: 26 * k, lineHeight: 32 * k, letterSpacing: -0.6 * k, color: on ? '#FFFFFF' : c.ink2 }}>{sum}</Text>
        </View>
      ))}
    </View>
  );
}

/** The large Home Screen widget with Pro: the battery, three counts and this week. */
function LargeWidget({ k }: { k: number }) {
  const glow = glowForCells(4);
  const week = ['u', 'u', 'r', 'u', 'u', 'f', 'f'];
  const count = (n: string, label: string) => (
    <View style={{ flex: 1, borderRadius: 12 * k, backgroundColor: 'rgba(255,255,255,0.07)', paddingVertical: 8 * k, paddingHorizontal: 8 * k }}>
      <Text style={{ fontFamily: display.bold, fontSize: 20 * k, lineHeight: 23 * k, color: c.ink }}>{n}</Text>
      <Text numberOfLines={2} style={{ fontSize: 9 * k, lineHeight: 11 * k, fontWeight: '600', color: c.ink3 }}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ width: 232 * k, height: 232 * k, borderRadius: 36 * k, backgroundColor: '#0F1A14', borderWidth: 1, borderColor: '#29402F', padding: 16 * k, justifyContent: 'space-between', overflow: 'hidden' }}>
      <GlowField color={glow} width={232 * k} centre={40 * k} reach={110 * k} strength={1.6} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * k }}>
        <View style={{ width: 92 * k }}>
          <GlowBattery cells={4} color={glow} height={40 * k} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 16 * k, lineHeight: 20 * k, fontWeight: '800', color: glow }}>
            Plenty left
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 9.5 * k, lineHeight: 13 * k, fontWeight: '600', color: c.ink3 }}>
            Recharges 6:00 AM
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 * k }}>
        {count('12', 'day streak')}
        {count('2', 'passes saved')}
        {count('3', 'perfect weeks')}
      </View>
      <View style={{ flexDirection: 'row', gap: 5 * k }}>
        {week.map((d, i) => (
          <View key={i} style={[{ flex: 1, height: 22 * k, borderRadius: 6 * k }, d === 'u' ? { backgroundColor: '#46CC70' } : d === 'r' ? { backgroundColor: '#FF7B6B' } : { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' }]} />
        ))}
      </View>
    </View>
  );
}

/** A small phone showing a locked app: the empty battery and the person's own words. */
function LockedApp({ k }: { k: number }) {
  const empty = toneAt(1);
  const w = 150 * k;
  return (
    <View style={{ width: w, height: w * 1.62, borderRadius: 26 * k, padding: 5 * k, backgroundColor: '#000000', borderWidth: 1.5, borderColor: '#34373C' }}>
      <View style={{ flex: 1, borderRadius: 21 * k, backgroundColor: empty.bg, alignItems: 'center', paddingTop: 34 * k, paddingHorizontal: 12 * k, paddingBottom: 12 * k }}>
        <View style={{ position: 'absolute', top: 8 * k, alignSelf: 'center', width: 42 * k, height: 12 * k, borderRadius: 6 * k, backgroundColor: '#000000' }} />
        <View style={{ width: 78 * k }}>
          <Battery cells={0} tone={empty} height={26 * k} flat decorative />
        </View>
        <Text style={{ fontFamily: display.bold, fontSize: 13 * k, lineHeight: 17 * k, color: empty.fg, marginTop: 12 * k, textAlign: 'center' }}>{"Battery's empty"}</Text>
        <View style={{ marginTop: 10 * k, borderRadius: 12 * k, borderWidth: 1.5, borderColor: PRO_COLOURS.lockMessage, backgroundColor: 'rgba(0,0,0,0.28)', paddingVertical: 8 * k, paddingHorizontal: 9 * k }}>
          <Text style={{ fontSize: 12 * k, lineHeight: 16 * k, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>{'“Put it down. Go for a walk.”'}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ alignSelf: 'stretch', height: 28 * k, borderRadius: 9 * k, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10.5 * k, fontWeight: '600', color: c.onPaper }}>Close this app</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 30, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, overflow: 'hidden' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
