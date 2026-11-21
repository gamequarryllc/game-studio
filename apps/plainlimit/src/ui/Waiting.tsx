import { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { c } from './theme';

/**
 * Three dots that pulse one after the other, wherever the phone's Screen Time
 * has yet to draw a figure. It can take from five seconds to half a minute,
 * and three still dots looked like the app had stopped (the owner, build 107).
 */
export function WaitingDots({ size = 10, height = 52, style }: { size?: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const [beat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = Animated.loop(Animated.timing(beat, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    run.start();
    return () => run.stop();
  }, [beat]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={[{ height, flexDirection: 'row', alignItems: 'center', gap: size * 0.6 }, style]}>
      {[0, 1, 2].map((i) => {
        // Each dot is brightest a third of a beat after the one before it.
        const at = i / 3;
        const opacity = beat.interpolate({
          inputRange: [0, at, Math.min(1, at + 1 / 3), 1].filter((v, k, all) => k === 0 || v > all[k - 1]),
          outputRange: [0, at, Math.min(1, at + 1 / 3), 1].filter((v, k, all) => k === 0 || v > all[k - 1]).map((v) => (v === at ? 1 : 0.25)),
        });
        return <Animated.View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.ink, opacity }} />;
      })}
    </View>
  );
}
