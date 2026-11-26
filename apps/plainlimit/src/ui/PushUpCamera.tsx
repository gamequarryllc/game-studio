import { requireNativeView } from 'expo';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import type { FaceSample } from '@/domain/pushUps';
import { CAMERA_AVAILABLE } from '@/platform/pushUps';

// The front camera's picture, small, so the person can see it sees them. The
// iPhone finds the face in it many times a second and passes on only how big
// it looks (PlainlimitPushUpsModule.swift). The screen stays awake while it
// is shown.

interface NativeProps {
  active: boolean;
  onFace: (event: { nativeEvent: { size: number; t: number } }) => void;
  style?: StyleProp<ViewStyle>;
}

const NativeCamera = CAMERA_AVAILABLE ? requireNativeView<NativeProps>('PlainlimitPushUps') : null;

export function PushUpCamera({ active, onFace, style }: { active: boolean; onFace: (sample: FaceSample) => void; style?: StyleProp<ViewStyle> }) {
  if (!NativeCamera) return <View style={[style, { backgroundColor: '#000000' }]} />;
  return (
    <NativeCamera
      active={active}
      onFace={(e) => {
        const { size, t } = e.nativeEvent;
        onFace({ t, size: size > 0 ? size : null });
      }}
      style={style}
    />
  );
}
