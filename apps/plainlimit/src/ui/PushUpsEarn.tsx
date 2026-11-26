import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cellsLeft } from '@/domain/battery';
import { clockLabel, clockLabelOf } from '@/domain/day';
import { countWords, earnStep } from '@/domain/earn';
import { HINT_WORDS, NO_FACE_MS, TRY_COUNT, countSample, depthOf, hintOf, startCount, type FaceSample, type PushUpCount } from '@/domain/pushUps';
import { success, tap } from '@/platform/haptics';
import { openPhoneSettings } from '@/platform/notices';
import { askCamera, cameraAccess, type CameraAccess } from '@/platform/pushUps';
import { DEV_TOOLS } from '@/platform/screenTime';
import { store } from '@/state/store';

import { FloorPicture } from './FloorPicture';
import { BigButton } from './kit';
import { PushUpCamera } from './PushUpCamera';
import { c, display } from './theme';
import { useDay } from './useDay';

// "Work for it" with push-ups (Pro): the phone flat on the floor under the
// face, and the front camera counts. Reached the same way as the sums (the
// empty screen's "I need more time", Today's button), and from Settings to
// try it with nothing to earn (`practice`).

export function PushUpsEarn({ practice = false, onSums }: { practice?: boolean; onSums?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, day, accent } = useDay();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const frame = { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 };

  // Fixed when the screen opens, as the sums are: earning the time (which raises the count) changes nothing on screen.
  const [step] = useState(() => (practice ? { with: 'pushUps' as const, count: TRY_COUNT, minutes: 0 } : earnStep('pushUps', day.topUps)));
  const [count, setCount] = useState<PushUpCount>(startCount);
  /** The camera's own clock, at its first reading and its last: how long the face has been out of sight. */
  const [firstAt, setFirstAt] = useState<number | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const [done, setDone] = useState(false);
  const [earnedUntil, setEarnedUntil] = useState<string | null>(null);
  const [access, setAccess] = useState<CameraAccess>(cameraAccess);

  // Turned on in the iPhone's Settings: seen on coming back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAccess(cameraAccess());
    });
    return () => sub.remove();
  }, []);

  // Each reading moves the count on; the last push-up earns the time (or ends the try).
  const counted = useRef<PushUpCount>(startCount());
  const over = useRef(false);
  const onFace = useCallback(
    (sample: FaceSample) => {
      setFirstAt((was) => was ?? sample.t);
      setLastAt(sample.t);
      if (over.current) return;
      const was = counted.current;
      const next = countSample(was, sample);
      counted.current = next;
      setCount(next);
      // A small tap for each push-up, felt through the floor.
      if (next.reps > was.reps) tap();
      if (next.reps < step.count) return;
      over.current = true;
      success();
      if (!practice) {
        store.earnTopUp();
        setEarnedUntil(store.get().doc.day.unlockedUntil);
      }
      setDone(true);
    },
    [step.count, practice],
  );

  const hasBattery = cellsLeft(day.usedMinutes, settings.goalMinutes) > 0;
  if (!practice && !done && (settings.emptyLevel !== 'work' || hasBattery)) {
    return (
      <Message
        frame={frame}
        title="Nothing to earn"
        lead={hasBattery ? 'Your battery still has charge. Push-ups are for when it is empty.' : 'Earning time is switched off. Choose “Work for it” in Settings to use it.'}
        buttons={<BigButton label="Back" onPress={leave} />}
      />
    );
  }

  if (done) {
    if (practice) {
      const first = earnStep('pushUps', 0);
      return (
        <Message
          frame={frame}
          title={`${countWords(step)} counted`}
          lead={`That’s how it works. When your battery is empty, ${countWords(first)} earn ${first.minutes} more minutes.`}
          buttons={<BigButton label="Done" onPress={leave} />}
        />
      );
    }
    const after = earnStep('pushUps', store.get().doc.day.topUps);
    return (
      <Message
        frame={frame}
        title={`${step.minutes} minutes earned`}
        lead={earnedUntil ? `Your apps open until ${clockLabelOf(new Date(earnedUntil))}. The battery is still empty.` : 'The battery is still empty.'}
        small={`Next time it’s ${countWords(after)} for ${after.minutes} minutes.`}
        buttons={<BigButton label="Done" onPress={leave} />}
      />
    );
  }

  const title = practice ? 'Try push-ups' : `Earn ${step.minutes} minutes`;
  const sums = !practice && onSums ? <BigButton quiet label="Do sums this time" onPress={onSums} /> : null;

  if (access === 'none' || access === 'denied') {
    return (
      <Message
        frame={frame}
        title={access === 'none' ? 'No camera to count with' : 'The camera is off'}
        lead={access === 'none' ? 'Push-ups are counted with the front camera, and this iPhone can’t use it.' : 'Push-ups are counted with the front camera. Turn it on for Plainlimit in Settings.'}
        buttons={
          <View style={{ gap: 12 }}>
            {access === 'denied' ? <BigButton label="Open Settings" onPress={openPhoneSettings} /> : null}
            {sums ?? <BigButton quiet label="Back" onPress={leave} />}
          </View>
        }
      />
    );
  }

  if (access === 'unasked') {
    return (
      <View style={[styles.page, frame]}>
        <View style={{ gap: 26 }}>
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Text style={styles.lead}>Plainlimit counts {countWords(step)} with the front camera. The picture stays on your iPhone and is never saved or sent.</Text>
          </View>
          <FloorPicture accent={accent} />
          <BigButton label="Turn on the camera" onPress={() => void askCamera().then(setAccess)} />
        </View>
        <Stop onPress={leave} />
      </View>
    );
  }

  const hint = hintOf(count, lastAt);
  // Sums stand in only when the camera can't do the job: no face found at all for a while (a dark room).
  const noFace = count.phase === 'looking' && firstAt !== null && lastAt - firstAt >= NO_FACE_MS;
  const depth = depthOf(count);
  const segments = step.count <= 10;
  return (
    <View style={[styles.page, frame]}>
      <View style={{ gap: 22 }}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.lead}>
            Lay your phone flat on the floor under your face, screen up. Do {countWords(step)}
            {practice ? '.' : `. Your battery still refills at ${clockLabel(settings.rechargeMinute)}.`}
          </Text>
        </View>

        <View style={styles.middle}>
          <PushUpCamera active={!done} onFace={onFace} style={styles.camera} />
          <View style={{ flex: 1, gap: 4 }} accessible accessibilityLabel={`${count.reps} of ${step.count} push-ups. ${HINT_WORDS[hint]}.`} accessibilityLiveRegion="polite">
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.count}>
              {count.reps}
            </Text>
            <Text style={styles.of}>of {step.count}</Text>
          </View>
          {/* How far down: full at the line that counts. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.depth}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(depth * 100)}%`, borderRadius: 6, backgroundColor: depth >= 1 ? accent : c.outline }} />
          </View>
        </View>

        {segments ? (
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: step.count }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < count.reps ? accent : c.raised }} />
            ))}
          </View>
        ) : (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
            <View style={{ width: `${(count.reps / step.count) * 100}%`, height: 8, borderRadius: 4, backgroundColor: accent }} />
          </View>
        )}

        <Text style={[styles.hint, hint === 'lost' ? { color: '#F0A08C' } : hint === 'pushUp' ? { color: accent } : null]}>{HINT_WORDS[hint]}</Text>
        {DEV_TOOLS ? (
          // Test builds: the readings behind the count, for tuning on a phone.
          <Text style={styles.dev}>
            Face {count.size === null ? 'none' : count.size.toFixed(2)} · top {count.top.toFixed(2)} · {count.phase}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        {noFace ? sums : null}
        <Stop onPress={leave} />
      </View>
    </View>
  );
}

function Stop({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.stop, pressed ? { opacity: 0.6 } : null]}>
      <Text style={styles.stopText}>Never mind, I&apos;ll stop</Text>
    </Pressable>
  );
}

function Message({ frame, title, lead, small, buttons }: { frame: object; title: string; lead: string; small?: string; buttons: ReactNode }) {
  return (
    <View style={[styles.page, frame]}>
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.lead}>{lead}</Text>
        {small ? <Text style={styles.small}>{small}</Text> : null}
      </View>
      {buttons}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 24, justifyContent: 'space-between' },
  title: { fontFamily: display.bold, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: c.ink },
  lead: { fontSize: 16, lineHeight: 22, color: c.ink2 },
  small: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  middle: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  camera: { width: 108, height: 144, borderRadius: 24, overflow: 'hidden' },
  count: { fontFamily: display.bold, fontSize: 120, lineHeight: 120, letterSpacing: -5, color: c.ink },
  of: { fontSize: 18, fontWeight: '600', color: c.ink3 },
  depth: { width: 12, height: 144, borderRadius: 6, backgroundColor: c.raised, overflow: 'hidden' },
  hint: { fontFamily: display.semi, fontSize: 28, lineHeight: 32, color: c.ink, textAlign: 'center' },
  dev: { fontSize: 12, lineHeight: 16, color: c.ink3, textAlign: 'center' },
  stop: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stopText: { fontSize: 16, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
});
