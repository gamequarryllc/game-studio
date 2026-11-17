import { View } from 'react-native';

import { CELLS } from '@/domain/battery';

import { c } from './theme';

// The day laid out flat: six stretches, one under each cell of the battery.
// Like the battery, what is lit is what is left: the charge drains from the
// right, so a stretch goes dark under the cell that went, and the two move
// the same way. (It once filled from the left, against the battery, which the
// owner found contradictory; then it lit what was used, which read as "one
// cell left" next to a battery whose used cells are empty slots.)

export function Ruler({ fraction, color }: { fraction: number; color: string }) {
  const left = (1 - Math.max(0, Math.min(1, fraction))) * CELLS;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${Math.round(Math.min(1, Math.max(0, fraction)) * 100)} percent of the goal used`} style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: CELLS }, (_, i) => {
        const part = Math.max(0, Math.min(1, left - i));
        return (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
            <View style={{ width: `${part * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
          </View>
        );
      })}
    </View>
  );
}
