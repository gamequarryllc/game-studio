import { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PREVIEW_PUSH_UP, PREVIEW_STEP_MS, type FaceSample } from '@/domain/pushUps';

import { c } from './theme';

// The web preview has no camera: a dark square stands in for it, with a
// button that plays one push-up (the face small, then big, then small again),
// so the screens and the browser tests can be walked through.

export function PushUpCamera({ active, onFace, style }: { active: boolean; onFace: (sample: FaceSample) => void; style?: StyleProp<ViewStyle> }) {
  // The preview's own clock, a reading every PREVIEW_STEP_MS.
  const clock = useRef(0);
  const send = useRef(onFace);
  useEffect(() => {
    send.current = onFace;
  });
  useEffect(() => {
    // A face is seen at once, at the top, as soon as the camera is on.
    if (active) send.current({ t: clock.current, size: PREVIEW_PUSH_UP[0] });
  }, [active]);
  const play = () => {
    for (const size of PREVIEW_PUSH_UP) {
      clock.current += PREVIEW_STEP_MS;
      send.current({ t: clock.current, size });
    }
  };
  return (
    <View style={[style, styles.box]}>
      <Pressable accessibilityRole="button" disabled={!active} onPress={play} style={({ pressed }) => [styles.button, pressed ? { opacity: 0.7 } : null]}>
        <Text style={styles.text}>Count a push-up</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 8 },
  button: { borderRadius: 12, borderWidth: 1, borderColor: c.outline, paddingVertical: 8, paddingHorizontal: 8 },
  text: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: c.ink2, textAlign: 'center' },
});
