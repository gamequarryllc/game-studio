import { Text, View } from 'react-native';

import type { DistanceUnit } from '@/domain/types';

import { plate, radius, type, useTheme } from './theme';

// A reading shown the way a dashboard shows it: figures in cells on a dark plate.

export function Odometer({ value, unit, size = 'm', testID }: { value: number | null; unit: DistanceUnit; size?: 's' | 'm' | 'l'; testID?: string }) {
  const { c } = useTheme();
  const cell = size === 'l' ? { w: 30, h: 44, f: 34 } : size === 'm' ? { w: 20, h: 30, f: 23 } : { w: 15, h: 22, f: 17 };
  const digits = value === null ? ['–', '–', '–', '–', '–', '–'] : String(Math.round(value)).padStart(6, '0').split('');
  return (
    <View testID={testID} accessible accessibilityLabel={value === null ? 'No odometer reading' : `Odometer ${value} ${unit}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      <View style={{ flexDirection: 'row', backgroundColor: c.plate, borderRadius: radius.s, padding: 2, gap: 1, borderWidth: 1, borderColor: c.plateRule }}>
        {digits.map((d, i) => (
          <View key={i} style={{ width: cell.w, height: cell.h, alignItems: 'center', justifyContent: 'center', borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: c.plateRule }}>
            <Text style={{ fontFamily: plate.semibold, fontSize: cell.f, lineHeight: cell.f + 2, color: c.onPlate, fontVariant: ['tabular-nums'] }}>{d}</Text>
          </View>
        ))}
      </View>
      <Text style={[type.unit, { color: c.ink2, marginBottom: size === 'l' ? 5 : 2 }]}>{unit}</Text>
    </View>
  );
}
