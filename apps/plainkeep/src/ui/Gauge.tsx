import { View } from 'react-native';

import { toneColor, useTheme, type Tone } from './theme';

// The rule: a row of marks, like the edge of a steel rule or the scale on a
// dipstick. Marks to the left of "now" are inked; the last mark, taller, is
// the day the job falls due.

export function Gauge({ used, tone, marks = 24, height = 10, testID }: { used: number | null; tone: Tone; marks?: number; height?: number; testID?: string }) {
  const { c } = useTheme();
  const filled = used === null ? 0 : Math.max(0, Math.min(marks, Math.round(used * marks)));
  const on = toneColor(c, tone);
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: used === null ? 0 : Math.round(Math.min(1, used) * 100) }}
      style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: height + 4 }}>
      {Array.from({ length: marks }, (_, i) => {
        const last = i === marks - 1;
        const major = i % 6 === 0;
        return (
          <View
            key={i}
            style={{
              width: 2,
              height: last ? height + 4 : major ? height : height * 0.62,
              borderRadius: 1,
              backgroundColor: i < filled ? on : last ? c.ink3 : c.rule,
            }}
          />
        );
      })}
    </View>
  );
}
