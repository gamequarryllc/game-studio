import { countWords, doWords, earnStep, earnWithOf } from '../earn';
import { puzzleNotice, monitorPlan } from '../monitorPlan';
import { PRO_FEATURES } from '../pro';
import { topUpPlan } from '../puzzle';
import {
  DOWN_RATIO,
  LOST_MS,
  MIN_REP_MS,
  PREVIEW_PUSH_UP,
  PREVIEW_STEP_MS,
  countSample,
  depthOf,
  hintOf,
  pushUpPlan,
  startCount,
  type FaceSample,
  type PushUpCount,
} from '../pushUps';
import { DEFAULT_SETTINGS, repairSettings } from '../settings';
import { emptyCopy } from '../shield';
import type { Settings } from '../types';

/** Runs readings through the counter, a reading every `step` ms from `from`. Null is no face. */
function run(sizes: readonly (number | null)[], step = 50, from = 0, start: PushUpCount = startCount()): PushUpCount {
  let count = start;
  sizes.forEach((size, i) => {
    count = countSample(count, { t: from + i * step, size });
  });
  return count;
}

/** One push-up as a phone under the face sees it: small at the top, about three times as big at the bottom. */
function pushUp(top = 0.22, bottom = 0.62, steps = 10): number[] {
  const down = Array.from({ length: steps }, (_, i) => top + ((bottom - top) * (i + 1)) / steps);
  const up = Array.from({ length: steps }, (_, i) => bottom - ((bottom - top) * (i + 1)) / steps);
  return [...down, ...up, top, top];
}

describe('what push-ups cost', () => {
  it('10 for 15 minutes, 15 for 10, 20 for 5, then 5 more each time for 5 minutes', () => {
    expect([0, 1, 2, 3, 4, 5].map(pushUpPlan)).toEqual([
      { count: 10, minutes: 15 },
      { count: 15, minutes: 10 },
      { count: 20, minutes: 5 },
      { count: 25, minutes: 5 },
      { count: 30, minutes: 5 },
      { count: 35, minutes: 5 },
    ]);
  });

  it('earns the same minutes as the sums each time, so the battery works the same either way', () => {
    for (let n = 0; n < 12; n++) expect(pushUpPlan(n).minutes).toBe(topUpPlan(n).minutes);
  });

  it('says it in words', () => {
    expect(doWords(earnStep('sums', 0))).toBe('Solve 3 sums');
    expect(doWords(earnStep('pushUps', 0))).toBe('Do 10 push-ups');
    expect(countWords({ with: 'pushUps', count: 1 })).toBe('1 push-up');
    expect(countWords({ with: 'sums', count: 1 })).toBe('1 sum');
  });
});

describe('the setting', () => {
  it('reads as sums when missing or unknown, and keeps push-ups', () => {
    expect(earnWithOf(DEFAULT_SETTINGS)).toBe('sums');
    expect(repairSettings({}).earnWith).toBeUndefined();
    expect(repairSettings({ earnWith: 'jumping jacks' }).earnWith).toBeUndefined();
    expect(repairSettings({ earnWith: 'sums' }).earnWith).toBeUndefined();
    expect(repairSettings({ earnWith: 'pushUps' }).earnWith).toBe('pushUps');
    expect(earnWithOf(repairSettings({ earnWith: 'pushUps' }))).toBe('pushUps');
  });

  it('is Pro, with its own card on the Pro screen', () => {
    expect(PRO_FEATURES.map((f) => f.key)).toContain('pushUps');
  });
});

describe('what the empty screen and its notification offer', () => {
  const work: Settings = { ...DEFAULT_SETTINGS, emptyLevel: 'work' };

  it('sums by default', () => {
    expect(emptyCopy(work, 0).line).toBe('Solve 3 sums for 15 more minutes, or wait until it recharges at 6:00 AM.');
    expect(puzzleNotice(0).body).toBe('Tap to solve 3 sums for 15 more minutes.');
  });

  it('push-ups when chosen, rising as the sums do', () => {
    const push: Settings = { ...work, earnWith: 'pushUps' };
    expect(emptyCopy(push, 0).line).toBe('Do 10 push-ups for 15 more minutes, or wait until it recharges at 6:00 AM.');
    expect(emptyCopy(push, 2).line).toBe('Do 20 push-ups for 5 more minutes, or wait until it recharges at 6:00 AM.');
    expect(puzzleNotice(1, 'pushUps')).toEqual({ title: 'Earn more time', body: 'Tap to do 15 push-ups for 10 more minutes.', route: '/puzzle' });
  });

  it('the plan hands the empty screen the choice, for its button\'s notification', () => {
    const empty = (s: Settings) => monitorPlan(s, 0, null).shields.find((x) => x.id === 'empty');
    expect(empty(work)?.earnWith).toBe('sums');
    expect(empty({ ...work, earnWith: 'pushUps' })?.earnWith).toBe('pushUps');
  });
});

describe('counting push-ups', () => {
  it('counts each trip down and back up', () => {
    const count = run([0.22, 0.22, ...pushUp(), ...pushUp(), ...pushUp()]);
    expect(count.reps).toBe(3);
    expect(count.phase).toBe('up');
  });

  it('does not count a dip that stops short of the line', () => {
    const shallow = pushUp(0.22, 0.22 * DOWN_RATIO * 0.95);
    expect(run([0.22, ...shallow, ...shallow]).reps).toBe(0);
  });

  it('does not count going down without coming back up', () => {
    const down = pushUp().slice(0, 10);
    expect(run([0.22, ...down, 0.6, 0.6, 0.6]).reps).toBe(0);
  });

  it('counts a push-up whose bottom is too close for the camera to see the face', () => {
    // Down past a third bigger, then lost, then back up.
    const sizes = [0.22, 0.22, 0.26, 0.3, 0.34, 0.38, null, null, null, null, null, 0.36, 0.3, 0.25, 0.22, 0.22];
    expect(run(sizes).reps).toBe(1);
  });

  it('a face lost at the top is not a push-up', () => {
    const sizes = [0.22, 0.22, 0.22, null, null, null, null, 0.22, 0.22, 0.22];
    expect(run(sizes).reps).toBe(0);
  });

  it('ignores one odd reading', () => {
    // A single huge size (a hand in front of the camera) and back.
    expect(run([0.22, 0.22, 0.22, 0.9, 0.22, 0.22, 0.22]).reps).toBe(0);
  });

  it('a flicker quicker than a push-up is not counted twice', () => {
    // A real push-up, then the size jumps down and up again within a few readings.
    const after = run([0.22, 0.22, ...pushUp()]);
    expect(after.reps).toBe(1);
    const flicker = run([0.6, 0.6, 0.6, 0.22, 0.22, 0.22], 20, 2000, { ...after, repAt: 1950 });
    expect(flicker.reps).toBe(1);
    expect(2000 + 5 * 20 - 1950).toBeLessThan(MIN_REP_MS);
  });

  it('measures each push-up from where it starts, so moving a little nearer or farther between them is fine', () => {
    const sizes = [0.2, 0.2, ...pushUp(0.2, 0.55), ...pushUp(0.26, 0.7), ...pushUp(0.18, 0.5)];
    expect(run(sizes).reps).toBe(3);
  });

  it('getting into place from far above (the face tiny) counts the first real push-up once', () => {
    const sizes = [0.08, 0.08, 0.1, 0.14, 0.2, 0.22, 0.22, ...pushUp(), ...pushUp()];
    expect(run(sizes).reps).toBe(2);
  });

  it('counts the web preview\'s stand-in push-up, once per press', () => {
    let count = countSample(startCount(), { t: 0, size: PREVIEW_PUSH_UP[0] });
    let t = 0;
    for (let press = 1; press <= 3; press++) {
      for (const size of PREVIEW_PUSH_UP) {
        t += PREVIEW_STEP_MS;
        count = countSample(count, { t, size });
      }
      expect(count.reps).toBe(press);
    }
  });

  it('readings with no number, or zero, are no face', () => {
    const odd: FaceSample[] = [
      { t: 0, size: NaN },
      { t: 10, size: 0 },
      { t: 20, size: -1 },
    ];
    expect(odd.reduce(countSample, startCount()).phase).toBe('looking');
  });
});

describe('what the screen says', () => {
  it('looks for the face, then says go down, push up, and when it has lost the face', () => {
    expect(hintOf(startCount(), 0)).toBe('findFace');
    const top = run([0.22, 0.22, 0.22]);
    expect(hintOf(top, 100)).toBe('goDown');
    expect(hintOf(top, 100 + LOST_MS + 1)).toBe('lost');
    const down = run([0.22, 0.22, ...pushUp().slice(0, 10)]);
    expect(down.phase).toBe('down');
    expect(hintOf(down, 600)).toBe('pushUp');
    // At the bottom the face is often out of sight: not "lost".
    expect(hintOf(down, 600 + LOST_MS * 3)).toBe('pushUp');
  });

  it('the depth bar fills on the way down', () => {
    expect(depthOf(startCount())).toBe(0);
    const top = run([0.2, 0.2, 0.2]);
    expect(depthOf(top)).toBe(0);
    const halfway = run([0.2, 0.2, 0.2, 0.26, 0.26, 0.26]);
    expect(depthOf(halfway)).toBeCloseTo(0.5, 1);
    expect(depthOf(run([0.22, 0.22, ...pushUp().slice(0, 10)]))).toBe(1);
  });
});
