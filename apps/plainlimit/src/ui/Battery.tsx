import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { CELLS } from '@/domain/battery';
import type { Tone } from '@/domain/tone';

import { usePulse, useReducedMotion } from './motion';

// The battery: a casing, six cells, and the little cap on the end. Every size
// in the app is this one drawing, scaled by its height.
//
// It is drawn flat, like a sticker: a hard shadow under the casing, and a
// short glint on each lit cell. A cell fades and shrinks away when it is
// used up, and the last one left breathes slowly.

export function Battery({
  cells,
  tone,
  height,
  flat = false,
  decorative = false,
  fill,
}: {
  cells: number;
  tone: Pick<Tone, 'fg' | 'track' | 'bg'>;
  height: number;
  flat?: boolean;
  decorative?: boolean;
  /** The colour inside the casing, when it is easing along with the ground it sits on. */
  fill?: Animated.AnimatedInterpolation<string | number>;
}) {
  const reduced = useReducedMotion();
  const lit = Math.max(0, Math.min(CELLS, cells));
  const [levels] = useState(() => Array.from({ length: CELLS }, (_, i) => new Animated.Value(i < lit ? 1 : 0)));
  const pulse = usePulse(lit === 1);

  useEffect(() => {
    const runs = levels.map((level, i) =>
      Animated.timing(level, { toValue: i < lit ? 1 : 0, duration: reduced ? 0 : 320, delay: reduced ? 0 : Math.abs(lit - i) * 28, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    );
    Animated.parallel(runs).start();
    return () => runs.forEach((r) => r.stop());
  }, [lit, levels, reduced]);

  const border = Math.max(3, Math.round(height * 0.07));
  const inset = Math.max(3, Math.round(height * 0.085));
  const radius = Math.round(height * 0.27);
  const cellRadius = Math.max(2, Math.round(height * 0.12));
  const drop = flat ? 0 : Math.max(3, Math.round(height * 0.085));
  const capWidth = Math.max(4, Math.round(height * 0.11));
  const capGap = Math.max(2, Math.round(height * 0.06));

  return (
    <View
      // A second, small battery beside words that already say the same is skipped by screen readers.
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : lit === 0 ? 'Battery, empty' : `Battery, ${lit} of ${CELLS} cells left`}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      aria-hidden={decorative}
      style={{ flexDirection: 'row', alignItems: 'center', gap: capGap, paddingBottom: drop }}>
      <View style={{ flex: 1, height }}>
        {drop > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: drop, height, borderRadius: radius, backgroundColor: tone.track }} /> : null}
        <Animated.View style={{ height, borderWidth: border, borderColor: tone.fg, borderRadius: radius, backgroundColor: fill ?? tone.bg, padding: inset, flexDirection: 'row', gap: inset }}>
          {levels.map((level, i) => (
            <View key={i} style={{ flex: 1, borderRadius: cellRadius, backgroundColor: tone.track, overflow: 'hidden' }}>
              <Animated.View
                style={{
                  flex: 1,
                  borderRadius: cellRadius,
                  backgroundColor: tone.fg,
                  opacity: lit === 1 && i === 0 ? Animated.multiply(level, pulse) : level,
                  transform: [{ scaleY: level.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
                }}>
                {height >= 40 ? (
                  <View style={{ position: 'absolute', left: '18%', right: '18%', top: Math.round(height * 0.07), height: Math.max(2, Math.round(height * 0.045)), borderRadius: 99, backgroundColor: tone.bg, opacity: 0.4 }} />
                ) : null}
              </Animated.View>
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={{ width: capWidth, height: Math.round(height * 0.4), backgroundColor: tone.fg, borderTopRightRadius: Math.round(height * 0.07), borderBottomRightRadius: Math.round(height * 0.07) }} />
    </View>
  );
}
