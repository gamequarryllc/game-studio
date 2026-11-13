import { View } from 'react-native';

import { CELLS } from '@/domain/battery';

import { c } from './theme';

// The day laid out flat: six stretches, one under each cell of the battery,
// lit as that cell is used up. The battery empties from the right, so this
// fills from the right too and the two move the same way; a lit stretch sits
// under the cell that went. (It used to fill from the left, against the
// battery, which the owner found contradictory.)

export function Ruler({ fraction, color }: { fraction: number; color: string }) {
  const used = Math.max(0, Math.min(1, fraction)) * CELLS;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${Math.round(Math.min(1, Math.max(0, fraction)) * 100)} percent of the goal used`} style={{ flexDirection: 'row-reverse', gap: 4 }}>
      {Array.from({ length: CELLS }, (_, i) => {
        const part = Math.max(0, Math.min(1, used - i));
        return (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
            <View style={{ width: `${part * 100}%`, height: 8, borderRadius: 4, backgroundColor: color, alignSelf: 'flex-end' }} />
          </View>
        );
      })}
    </View>
  );
}
