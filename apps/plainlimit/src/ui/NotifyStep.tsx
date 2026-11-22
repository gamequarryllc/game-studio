import { StyleSheet, Text, View } from 'react-native';

import { toneForCells } from '@/domain/tone';

import { Battery } from './Battery';
import { Icon, type IconName } from './icons';
import { tiles } from './kit';
import { c, display } from './theme';

// Setup's notifications screen, between "Your essentials" and "How much a
// day?". Up to build 144 the iPhone's question came with no screen of its own,
// after "Start counting", and said nothing of why. But the app needs them: the
// empty screen's "I need more time" reaches the sums only through a
// notification, so without them it does nothing. The owner asked for the
// question to move here, with that said plainly (2026-11-22). It is also where
// the phone gets its head start on the next screen's chart, which setup asks
// for out of sight behind this one.

/** The picture: a lock screen with Plainlimit's own warning on it, in the words the phone will use. */
export function NotifyPicture() {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="A notification from Plainlimit: Nearly out. Your battery is about to run out for today." style={styles.card}>
      <Text style={styles.clock}>9:41</Text>
      <View style={styles.banner}>
        <View style={styles.app}>
          <Battery cells={1} tone={{ fg: toneForCells(1).bg, track: 'rgba(255,255,255,0.3)', bg: APP_GROUND }} height={13} flat decorative />
        </View>
        <View style={styles.bannerWords}>
          <View style={styles.bannerTop}>
            <Text style={styles.bannerTitle}>Nearly out</Text>
            <Text style={styles.bannerWhen}>now</Text>
          </View>
          <Text style={styles.bannerBody}>Your battery is about to run out for today.</Text>
        </View>
      </View>
    </View>
  );
}

/** What they are for, in three lines. */
export function NotifyStory() {
  return (
    <View style={{ gap: 10 }}>
      <Line icon="bell" colour={tiles.yellow} words={'A warning when you’re nearly out'} />
      <Line icon="sums" colour={tiles.green} words="The pop-up to earn more time" />
      <Line icon="bellOff" colour={tiles.gray} words="Nothing else, ever" />
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

const APP_GROUND = '#0B0D0E';

const styles = StyleSheet.create({
  card: { height: 208, borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 16, marginBottom: 8 },
  clock: { fontFamily: display.bold, fontSize: 44, lineHeight: 46, letterSpacing: -1, color: c.ink2 },
  banner: { alignSelf: 'stretch', maxWidth: 300, borderRadius: 20, backgroundColor: '#2A2D32', paddingVertical: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  // The battery takes the width it is given.
  app: { width: 38, height: 38, borderRadius: 10, backgroundColor: APP_GROUND, justifyContent: 'center', paddingHorizontal: 5 },
  bannerWords: { flex: 1 },
  bannerTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bannerTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: c.ink },
  bannerWhen: { fontSize: 12, color: c.ink3 },
  bannerBody: { fontSize: 13.5, lineHeight: 18, color: c.ink2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '500', color: c.ink },
});
