import { View } from 'react-native';

import { c } from './theme';

// How to lie for push-ups, drawn plainly: on the push-up screens and on the
// Pro card for push-ups. Drawn for 260 by 128 points, times `k`.

/** Side on: a phone flat on the floor, screen up, under someone's face in a push-up. */
export function FloorPicture({ accent, k = 1 }: { accent: string; k?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="A phone flat on the floor, screen up, under your face as you do a push-up." style={{ width: 260 * k, height: 128 * k, alignSelf: 'center' }}>
      {/* The camera's view, up from the phone to the face. */}
      <View style={{ position: 'absolute', left: 56 * k, bottom: 22 * k, width: 2 * k, height: 50 * k, borderRadius: k, backgroundColor: accent, opacity: 0.45 }} />
      {/* Head, body and arm. */}
      <View style={{ position: 'absolute', left: 44 * k, bottom: 74 * k, width: 26 * k, height: 26 * k, borderRadius: 13 * k, backgroundColor: c.ink }} />
      <View style={{ position: 'absolute', left: 66 * k, bottom: 56 * k, width: 176 * k, height: 12 * k, borderRadius: 6 * k, backgroundColor: c.ink, transform: [{ rotate: '13deg' }] }} />
      <View style={{ position: 'absolute', left: 82 * k, bottom: 14 * k, width: 10 * k, height: 62 * k, borderRadius: 5 * k, backgroundColor: c.ink }} />
      {/* The phone, glowing, and the floor. */}
      <View style={{ position: 'absolute', left: 30 * k, bottom: 14 * k, width: 56 * k, height: 8 * k, borderRadius: 3 * k, backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.8, shadowRadius: 10 * k, shadowOffset: { width: 0, height: 0 } }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 10 * k, height: 3 * k, borderRadius: 2 * k, backgroundColor: c.outline }} />
    </View>
  );
}
