import { View } from 'react-native';

import { CELLS } from '@/domain/battery';
import type { Tone } from '@/domain/tone';

// The battery: an outline, six cells, and the little cap on the end.
// Every size in the app is this one drawing, scaled by its height.

export function Battery({ cells, tone, height }: { cells: number; tone: Pick<Tone, 'fg' | 'track'>; height: number }) {
  const border = Math.max(3, Math.round(height * 0.065));
  const inset = Math.max(3, Math.round(height * 0.085));
  const lit = Math.max(0, Math.min(CELLS, cells));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={lit === 0 ? 'Battery, empty' : `Battery, ${lit} of ${CELLS} cells left`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: Math.max(2, Math.round(height * 0.06)) }}>
      <View
        style={{
          flex: 1,
          height,
          borderWidth: border,
          borderColor: tone.fg,
          borderRadius: Math.round(height * 0.25),
          padding: inset,
          flexDirection: 'row',
          gap: inset,
        }}>
        {Array.from({ length: CELLS }, (_, i) => (
          <View key={i} style={{ flex: 1, borderRadius: Math.max(2, Math.round(height * 0.1)), backgroundColor: i < lit ? tone.fg : tone.track }} />
        ))}
      </View>
      <View
        style={{
          width: Math.max(4, Math.round(height * 0.11)),
          height: Math.round(height * 0.38),
          backgroundColor: tone.fg,
          borderTopRightRadius: Math.round(height * 0.06),
          borderBottomRightRadius: Math.round(height * 0.06),
        }}
      />
    </View>
  );
}
