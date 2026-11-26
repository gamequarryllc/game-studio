/**
 * Why iOS turned down a request for Screen Time access, and what to say.
 *
 * Apple's request (FamilyControls, individual authorization) fails without a
 * sheet when the device can't grant it: no passcode, no usable Apple Account,
 * Screen Time restricted by a profile, and so on. Up to build 152 every such
 * failure was shown as "access was not given", in a small line under the
 * button. App Review tried 1.1.0 on an iPad (2026-11-26) and reported the
 * "Turn on Screen Time" button as not working. Now the native module names
 * the refusal ("familycontrols:<case>", in the patch to
 * react-native-device-activity) and the screen says what it was, and what to
 * do about it.
 */

export type Refusal =
  /** "Don't Allow", or the passcode step was cancelled. */
  | 'declined'
  /** The device has no passcode; iOS needs one to confirm. */
  | 'passcode'
  /** The device's Apple Account can't be used for this (none signed in, or one that can't). */
  | 'account'
  /** Screen Time is restricted on the device (a management profile, or Screen Time's own restrictions). */
  | 'restricted'
  /** Another app manages Screen Time on the device. */
  | 'conflict'
  /** iOS couldn't reach Apple. */
  | 'network'
  /** iOS didn't answer at all within the wait. */
  | 'noAnswer'
  /** Anything else iOS said. */
  | 'other';

const BY_CASE: Record<string, Refusal> = {
  authorizationCanceled: 'declined',
  authenticationMethodUnavailable: 'passcode',
  invalidAccountType: 'account',
  restricted: 'restricted',
  authorizationConflict: 'conflict',
  networkError: 'network',
};

/**
 * FamilyControlsError's numbers, as Apple's own staff gave them on its forums,
 * for an error that reaches the app without the patch's name (5 and 7 only).
 */
const BY_NUMBER: Record<string, Refusal> = { '5': 'declined', '7': 'passcode' };

/** Reads the refusal out of the error the request threw. */
export function refusalOf(error: unknown): Refusal {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const named = /familycontrols:(\w+)/.exec(text);
  if (named) return BY_CASE[named[1]] ?? 'other';
  const numbered = /FamilyControlsError error (\d+)/.exec(text);
  if (numbered) return BY_NUMBER[numbered[1]] ?? 'other';
  return 'other';
}

/** What the screen says about a refusal: a short title, and what happened and what to do. */
export function refusalWords(refusal: Refusal): { title: string; line: string } {
  switch (refusal) {
    case 'declined':
      return { title: 'Access wasn’t given', line: 'Try again, then tap Continue and confirm with your passcode.' };
    case 'passcode':
      return {
        title: 'This device needs a passcode',
        line: 'iOS only lets apps use Screen Time on a device with a passcode. Set one in the Settings app, under Passcode, then try again.',
      };
    case 'account':
      return {
        title: 'iOS needs an Apple Account',
        line: 'iOS turned this down because of the Apple Account on this device. Check that you’re signed in at the top of the Settings app, then try again.',
      };
    case 'restricted':
      return {
        title: 'Screen Time is restricted here',
        line: 'This device doesn’t allow apps to use Screen Time, because of a device management profile or Screen Time’s own restrictions. Lift the restriction in the Settings app, then try again.',
      };
    case 'conflict':
      return { title: 'Another app manages Screen Time', line: 'iOS turned this down because another app already manages Screen Time on this device.' };
    case 'network':
      return { title: 'iOS couldn’t reach Apple', line: 'Check the internet connection, then try again.' };
    case 'noAnswer':
      return { title: 'iOS didn’t answer', line: 'Try again. If nothing comes up, close Plainlimit fully and open it again.' };
    default:
      return { title: 'iOS turned this down', line: 'Check that Screen Time is on in the Settings app, then try again.' };
  }
}

/**
 * Whether the refusal is worth a pop-up, not only a line on the screen: iOS
 * refused without asking, so nothing visible happened after the tap. Not after
 * "Don't Allow", which the person chose.
 */
export function refusalNeedsAlert(refusal: Refusal): boolean {
  return refusal !== 'declined';
}
