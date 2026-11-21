import { keyframes } from '../tipDemos/loop';
import { TIPS } from '../tips';

describe('tip demo keyframes', () => {
  it('runs from the start of the loop to its end, always forward', () => {
    const { inputRange, outputRange } = keyframes([
      [[10, 20], 1],
      [30, 0],
    ]);
    expect(inputRange[0]).toBe(0);
    expect(inputRange[inputRange.length - 1]).toBe(1);
    expect(inputRange.length).toBe(outputRange.length);
    for (let i = 1; i < inputRange.length; i++) expect(inputRange[i]).toBeGreaterThan(inputRange[i - 1]);
  });

  it('holds before the first stop and after the last', () => {
    const { inputRange, outputRange } = keyframes([
      [[10, 20], 1],
      [30, 0],
    ]);
    expect(outputRange[0]).toBe(1);
    expect(outputRange[outputRange.length - 1]).toBe(0);
    expect(outputRange[inputRange.indexOf(0.2)]).toBe(1);
    expect(outputRange[inputRange.indexOf(0.3)]).toBe(0);
  });

  it('eases a change: slow at both ends, never past either value', () => {
    const { inputRange, outputRange } = keyframes([
      [0, 0],
      [40, 100],
    ]);
    const between = outputRange.filter((_, i) => inputRange[i] > 0 && inputRange[i] < 0.4);
    expect(between.length).toBeGreaterThan(0);
    between.forEach((v) => expect(v > 0 && v < 100).toBe(true));
    expect(between[0]).toBeLessThan(25);
    expect(between[between.length - 1]).toBeGreaterThan(75);
  });

  it('keeps one value for one moment when two stops share a point', () => {
    const { inputRange } = keyframes([
      [[0, 24], 1],
      [24, 0],
      [100, 0],
    ]);
    expect(new Set(inputRange).size).toBe(inputRange.length);
  });
});

describe('tips', () => {
  it('each tip has its own demo', () => {
    expect(new Set(TIPS.map((t) => t.demo)).size).toBe(TIPS.length);
  });
});
