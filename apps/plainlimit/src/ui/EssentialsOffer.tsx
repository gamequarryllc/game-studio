import { Text, View } from 'react-native';

import { ESSENTIALS_LIMIT, MOCK_PHONE, SCREEN_TIME_AVAILABLE, isOn } from '@/platform/screenTime';

import { EVERYTHING_COUNTS, tooManyKept } from './countWords';
import { useEssentials } from './EssentialsSteps';
import { BigButton, IconTile, type RowIcon } from './kit';
import { c, display } from './theme';

// On Today until the essentials are chosen. Setup no longer asks
// (app/setup.tsx): everything counts from the first minute, so the
// essentials are an offer made here, where the battery is. One button opens
// Apple's list, and what is ticked stops counting at once: the first choice
// never waits for the recharge, even on an empty battery. Closing the list
// with nothing ticked is a choice too, and the card goes either way; after
// that the essentials are changed in Settings, under Essentials.

/** A few apps people keep open, as plain pictures: the same three as on Settings' Essentials row. */
const EXAMPLES: RowIcon[] = [
  { name: 'phone', bg: '#34C759' },
  { name: 'message', bg: '#34C759' },
  { name: 'map', bg: '#3B82F6' },
];

/** The green of the essentials (EssentialsSteps.tsx). */
const FREE = '#57E389';

export function EssentialsOffer() {
  // Asks the phone as it draws whether counting is on and the essentials are chosen: never kept from an earlier drawing.
  'use no memo';
  const e = useEssentials();
  if (!(SCREEN_TIME_AVAILABLE || MOCK_PHONE) || !isOn() || e.ready) return null;
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.tiles}>
          {EXAMPLES.map((icon) => (
            <IconTile key={icon.name} icon={icon} size={30} />
          ))}
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Keep your essentials free
        </Text>
      </View>
      <Text style={styles.line}>{`Pick the apps that never count and never lock. ${EVERYTHING_COUNTS}`}</Text>
      {e.refused > 0 ? (
        <Text accessibilityRole="alert" style={styles.warn}>
          {tooManyKept(e.refused, ESSENTIALS_LIMIT)}
        </Text>
      ) : null}
      <BigButton label="Choose essentials" onPress={e.start} />
      {e.pickers}
    </View>
  );
}

const styles = {
  box: { borderRadius: 22, backgroundColor: '#13201A', borderWidth: 1, borderColor: 'rgba(87,227,137,0.38)', padding: 16, gap: 12 },
  head: { gap: 10 },
  tiles: { flexDirection: 'row', gap: 6 },
  title: { fontFamily: display.bold, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: FREE },
  line: { fontSize: 16, lineHeight: 22, color: c.ink },
  warn: { fontSize: 15, lineHeight: 21, color: '#F79200' },
} as const;
