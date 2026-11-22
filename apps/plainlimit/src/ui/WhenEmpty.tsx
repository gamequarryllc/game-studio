import { StyleSheet, Text, View } from 'react-native';

import { toneForCells } from '@/domain/tone';

import { Battery } from './Battery';
import { Icon, type IconName } from './icons';
import { tiles } from './kit';
import { c, display } from './theme';

// Setup's screen between "Your essentials" and "How much a day?": what an
// empty battery looks like, and the ways the apps open again. The welcome
// screen says the apps lock; this is the first time a lock is shown. It is
// also where the phone gets its head start on the goal screen's chart, which
// setup asks for out of sight behind this screen (the owner, build 144, picked
// it from three drafts: a screen worth looking at while the chart loads).

/** The picture: a phone showing a locked app, and three app tiles with locks on them. */
export function EmptyPicture() {
  const tone = toneForCells(0);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="A locked app. It says: Battery's empty." style={styles.card}>
      <View style={styles.phone}>
        <View style={[styles.screen, { backgroundColor: tone.bg }]}>
          <View style={styles.battery}>
            <Battery cells={0} tone={tone} height={26} flat decorative />
          </View>
          <Text style={[styles.title, { color: tone.fg }]}>{'Battery’s\nempty'}</Text>
          <Icon name="lock" size={20} color="rgba(255,255,255,0.8)" />
        </View>
      </View>
      <View style={styles.apps}>
        {[tiles.pink, tiles.purple, tiles.orange].map((colour) => (
          <View key={colour} style={[styles.app, { backgroundColor: colour }]}>
            <View style={styles.shade}>
              <Icon name="lock" size={20} color="#FFFFFF" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** How a lock ends, in three lines. `recharge` is the time as the screen says it ("6:00 AM"). */
export function EmptyStory({ recharge }: { recharge: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Line icon="recharge" colour={tiles.green} words={`Opens again at ${recharge}`} />
      <Line icon="pass" colour={tiles.red} words="Or use an emergency pass" />
      <Line icon="essentials" colour={tiles.pink} words="Essentials always open" />
    </View>
  );
}

function Line({ icon, colour, words }: { icon: IconName; colour: string; words: string }) {
  return (
    <View style={styles.line}>
      <View style={[styles.tile, { backgroundColor: colour }]}>
        <Icon name={icon} size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.words}>{words}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { height: 236, borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26, marginBottom: 8 },
  phone: { width: 118, height: 214, borderRadius: 24, backgroundColor: '#2B2E33', padding: 5 },
  screen: { flex: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  // The battery takes the width it is given.
  battery: { width: 66 },
  title: { fontFamily: display.bold, fontSize: 15, lineHeight: 17, textAlign: 'center' },
  apps: { gap: 12 },
  app: { width: 44, height: 44, borderRadius: 11, overflow: 'hidden' },
  shade: { flex: 1, backgroundColor: 'rgba(14,16,17,0.62)', alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '500', color: c.ink },
});
