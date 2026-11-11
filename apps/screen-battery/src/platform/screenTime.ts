import { Platform } from 'react-native';

// Where real screen time will come from.
//
// On an iPhone the numbers belong to Apple's Screen Time. An app may use them
// only with Apple's Family Controls approval, and only in a development or
// store build: never in Expo Go and never in a browser. Until that build
// exists this file says "not available", and the app runs on pretend use that
// is added by hand from Settings, under Developer.
//
// What plugs in here later (NOTES.md has the full list):
//   - asking for Screen Time permission
//   - Apple's app picker, for "what counts" and "always allowed"
//   - the checkpoints from src/domain/checkpoints.ts, registered with the phone
//   - the warning and empty screens, and the lock
//   - the home screen widget

/** True only in a build that carries the Screen Time pieces. */
export const SCREEN_TIME_AVAILABLE = false;

/** Developer tools (pretend use, screen previews) show in dev builds and on the web preview, never in a store build. */
export const DEV_TOOLS = __DEV__ || Platform.OS === 'web';
