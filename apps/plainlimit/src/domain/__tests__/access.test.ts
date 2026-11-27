import { refusalNeedsAlert, refusalOf, refusalWords, type Refusal } from '../access';

describe('why iOS turned down Screen Time access', () => {
  it('reads the name the native patch gives, inside Expo’s wrapping', () => {
    const error = new Error("Calling the 'requestAuthorization' function has failed\n→ Caused by: familycontrols:authenticationMethodUnavailable");
    expect(refusalOf(error)).toBe('passcode');
    expect(refusalOf(new Error('familycontrols:authorizationCanceled'))).toBe('declined');
    expect(refusalOf(new Error('familycontrols:invalidAccountType'))).toBe('account');
    expect(refusalOf(new Error('familycontrols:restricted'))).toBe('restricted');
    expect(refusalOf(new Error('familycontrols:authorizationConflict'))).toBe('conflict');
    expect(refusalOf(new Error('familycontrols:networkError'))).toBe('network');
    expect(refusalOf(new Error('familycontrols:unavailable'))).toBe('other');
    expect(refusalOf(new Error('familycontrols:somethingNew'))).toBe('other');
  });

  it('falls back on the two numbers Apple has named, for an error without the name', () => {
    expect(refusalOf(new Error('The operation couldn’t be completed. (FamilyControls.FamilyControlsError error 7.)'))).toBe('passcode');
    expect(refusalOf(new Error('The operation couldn’t be completed. (FamilyControls.FamilyControlsError error 5.)'))).toBe('declined');
    expect(refusalOf(new Error('The operation couldn’t be completed. (FamilyControls.FamilyControlsError error 2.)'))).toBe('other');
  });

  it('calls anything else "other"', () => {
    expect(refusalOf(new Error('something broke'))).toBe('other');
    expect(refusalOf('familycontrols:restricted')).toBe('restricted');
    expect(refusalOf(undefined)).toBe('other');
  });

  it('has words for every refusal, and pops up for all but the person’s own "Don’t Allow"', () => {
    const all: Refusal[] = ['declined', 'passcode', 'account', 'restricted', 'conflict', 'network', 'noAnswer', 'other'];
    for (const refusal of all) {
      const { title, line } = refusalWords(refusal);
      expect(title.length).toBeGreaterThan(0);
      expect(line.length).toBeGreaterThan(0);
      expect(refusalNeedsAlert(refusal)).toBe(refusal !== 'declined');
    }
    expect(refusalWords('passcode').line).toContain('passcode');
  });
});
