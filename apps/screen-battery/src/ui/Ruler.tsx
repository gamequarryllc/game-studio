import { View } from 'react-native';

import { CELLS } from '@/domain/battery';

import { c } from './theme';

// The day laid out flat: six stretches, one per cell, filled as far as the
// day has gone. It is the battery read the other way round, so it fills as
// the battery empties.

export function Ruler({ fraction, color }: { fraction: number; color: string }) {
  const used = Math.max(0, Math.min(1, fraction)) * CELLS;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${Math.round(Math.min(1, Math.max(0, fraction)) * 100)} percent of the goal used`} style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: CELLS }, (_, i) => {
        const part = Math.max(0, Math.min(1, used - i));
        return (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
            <View style={{ width: `${part * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
          </View>
        );
      })}
    </View>
  );
}
