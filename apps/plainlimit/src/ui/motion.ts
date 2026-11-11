import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

// Small movements: a colour that eases to the next one, and a slow pulse.
// Both stand still for anyone who has asked their phone for less motion.

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** A colour that moves to its new value over half a second instead of jumping. */
export function useEasedColor(color: string): Animated.AnimatedInterpolation<string | number> {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  const [pair, setPair] = useState({ from: color, to: color });
  if (pair.to !== color) setPair({ from: pair.to, to: color });
  useEffect(() => {
    if (pair.from === pair.to) return;
    progress.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const run = Animated.timing(progress, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [pair, progress, reduced]);
  return progress.interpolate({ inputRange: [0, 1], outputRange: [pair.from, pair.to] });
}

/** Goes gently between 1 and `low`, for as long as `on` is true. */
export function usePulse(on: boolean, low = 0.45): Animated.Value {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!on || reduced) {
      value.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: low, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(value, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, reduced, low, value]);
  return value;
}
