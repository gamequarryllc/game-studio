import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { CELLS } from '@/domain/battery';

import { usePulse, useReducedMotion } from './motion';

// Today's battery, in the look of the app's icon and its Home Screen widget
// (the owner's pick, 2026-11-22): a pale casing on the dark ground and cells
// that shine in the day's colour. A used cell is a faint outlined slot. Once
// it is empty the casing itself glows red. The last cell left breathes slowly.

const SHELL = '#E9ECEA';
const SLOT = 'rgba(255,255,255,0.2)';

export function GlowBattery({ cells, color, height }: { cells: number; color: string; height: number }) {
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

  const empty = lit === 0;
  const shell = empty ? color : SHELL;
  const border = Math.max(3, Math.round(height * 0.06));
  const inset = Math.max(3, Math.round(height * 0.095));
  const gap = Math.max(3, Math.round(height * 0.08));
  const radius = Math.round(height * 0.29);
  const cellRadius = Math.max(2, Math.round(height * 0.14));
  const slotLine = Math.max(1.5, Math.round(height * 0.05) / 2);
  const shine = (size: number, opacity = 0.9) => ({ shadowColor: color, shadowOpacity: opacity, shadowRadius: size, shadowOffset: { width: 0, height: 0 } });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={empty ? 'Battery, empty' : `Battery, ${lit} of ${CELLS} cells left`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: Math.max(3, Math.round(height * 0.06)) }}>
      <View style={[{ flex: 1, height, borderWidth: border, borderColor: shell, borderRadius: radius, padding: inset, flexDirection: 'row', gap }, empty ? shine(height * 0.2) : null]}>
        {levels.map((level, i) => (
          <View key={i} style={{ flex: 1 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: cellRadius, borderWidth: slotLine, borderColor: SLOT }} />
            <Animated.View
              style={[
                { flex: 1, borderRadius: cellRadius, backgroundColor: color, opacity: lit === 1 && i === 0 ? Animated.multiply(level, pulse) : level, transform: [{ scaleY: level.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] },
                i < lit ? shine(height * 0.16) : null,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={[{ width: Math.max(4, Math.round(height * 0.09)), height: Math.round(height * 0.38), borderRadius: Math.round(height * 0.045), backgroundColor: shell }, empty ? shine(height * 0.14) : null]} />
    </View>
  );
}

/**
 * The soft light behind Today's battery: the day's colour, strongest behind
 * the battery and gone `reach` points below its middle (`centre`, from the top
 * of the page), so nothing under it is tinted: the phone draws the day's
 * figure on the plain ground. Drawn as many rings laid over each other, each
 * so faint that no edge shows.
 */
export function GlowField({ color, width, centre, reach }: { color: string; width: number; centre: number; reach: number }) {
  const rings = 30;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ position: 'absolute', top: 0, left: 0, width, height: centre + reach, overflow: 'hidden' }}>
      {Array.from({ length: rings }, (_, i) => {
        const k = 1 - (i / rings) * 0.88; // 1 for the widest ring
        const w = width * 1.5 * k;
        const h = reach * 2 * k;
        return <View key={i} style={{ position: 'absolute', left: (width - w) / 2, top: centre - h / 2, width: w, height: h, borderRadius: h / 2, backgroundColor: color, opacity: 0.0085 }} />;
      })}
    </View>
  );
}
