import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { MOCK } from './mock';

// The front camera, for counting push-ups (src/domain/pushUps.ts). The
// iPhone's side is modules/plainlimit-widgets/ios/PlainlimitPushUpsModule.swift:
// it finds the face in each picture and passes on only how big it looks. No
// picture is kept or sent anywhere.

/** May the app use the camera: yes, no, not asked yet, or there is no camera to use. */
export type CameraAccess = 'granted' | 'denied' | 'unasked' | 'none';

interface NativePushUps {
  cameraAccess(): CameraAccess;
  askCamera(): Promise<CameraAccess>;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativePushUps>('PlainlimitPushUps') : null;

/** The camera can count here: an iPhone build that carries the module. The web preview pretends (PushUpCamera.web.tsx). */
export const CAMERA_AVAILABLE = native !== null;

/** The web preview plays along, so the screens can be walked through; "?mock=cameraOff" shows the camera turned off. */
let pretend: CameraAccess = MOCK.has('cameraOff') ? 'denied' : 'unasked';

const ANSWERS: readonly CameraAccess[] = ['granted', 'denied', 'unasked', 'none'];
const answerOf = (value: unknown): CameraAccess => (ANSWERS.includes(value as CameraAccess) ? (value as CameraAccess) : 'none');

/** Whether the camera may be used, without asking. */
export function cameraAccess(): CameraAccess {
  if (!native) return Platform.OS === 'web' ? pretend : 'none';
  try {
    return answerOf(native.cameraAccess());
  } catch {
    return 'none';
  }
}

/** Asks for the camera. The iPhone puts the question only once; after that this just reports the answer. */
export async function askCamera(): Promise<CameraAccess> {
  if (!native) {
    if (Platform.OS === 'web' && pretend === 'unasked') pretend = 'granted';
    return cameraAccess();
  }
  try {
    return answerOf(await native.askCamera());
  } catch {
    return cameraAccess();
  }
}
