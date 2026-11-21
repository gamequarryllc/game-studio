import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { useReducedMotion } from '../motion';

// The clock every tip demo runs on: one value going from 0 to 1 over six
// seconds, again and again. Each drawing in a demo reads its own movement off
// it with `track`, written like a CSS keyframe list, so all nine stay simple
// and only move things (position, size, turn, fade). That lets the phone run
// them off the JavaScript thread.

export const LOOP_MS = 6000;

/**
 * The demo clock. `still` is where it stands for anyone who has asked for
 * less motion: a moment that shows the tip already done.
 */
export function useLoop(still: number): Animated.Value {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      t.setValue(still);
      return;
    }
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, still, t]);
  return t;
}

/** A value from `from` (a percent of the loop) until `to`, or at one percent. */
export type Stop = [at: number | [from: number, to: number], value: number];

/** In-between points added to each change, so it eases in and out instead of moving at one speed. */
const SMOOTH = 4;
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Points on the loop (0 to 1) and the value at each, eased between changes. Before the first stop and after the last, the value holds. */
export function keyframes(stops: readonly Stop[]): { inputRange: number[]; outputRange: number[] } {
  const flat: [number, number][] = [];
  for (const [at, value] of stops) {
    if (Array.isArray(at)) flat.push([at[0], value], [at[1], value]);
    else flat.push([at, value]);
  }
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const push = (p: number, v: number) => {
    const x = p / 100;
    // A stop on the same point as the one before would make two values for one moment.
    if (inputRange.length && x <= inputRange[inputRange.length - 1]) return;
    inputRange.push(x);
    outputRange.push(v);
  };
  flat.forEach(([p, v], i) => {
    if (i > 0) {
      const [p0, v0] = flat[i - 1];
      if (v0 !== v && p > p0) {
        for (let k = 1; k < SMOOTH; k++) push(p0 + ((p - p0) * k) / SMOOTH, v0 + (v - v0) * easeInOut(k / SMOOTH));
      }
    }
    push(p, v);
  });
  if (inputRange[0] > 0) {
    inputRange.unshift(0);
    outputRange.unshift(outputRange[0]);
  }
  if (inputRange[inputRange.length - 1] < 1) {
    inputRange.push(1);
    outputRange.push(outputRange[outputRange.length - 1]);
  }
  return { inputRange, outputRange };
}

/** A number that follows `stops` as the loop runs. */
export function track(t: Animated.Value, stops: readonly Stop[]): Animated.AnimatedInterpolation<number> {
  return t.interpolate({ ...keyframes(stops), extrapolate: 'clamp' });
}

/** A turn in degrees that follows `stops`. */
export function turn(t: Animated.Value, stops: readonly Stop[]): Animated.AnimatedInterpolation<string> {
  const { inputRange, outputRange } = keyframes(stops);
  return t.interpolate({ inputRange, outputRange: outputRange.map((d) => `${d}deg`), extrapolate: 'clamp' });
}
