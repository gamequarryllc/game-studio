/**
 * Straight back to the app after a Second thought sum (see
 * src/domain/appLinks.ts for why and how). The covering screen's extension
 * notes which app it was drawn for; this reads the note and opens that app by
 * its own link. Nothing here leaves the phone.
 */

import { Linking, Platform } from 'react-native';

import { asCovered, linkFor, type AppLink } from '@/domain/appLinks';

import { coveredApp } from './saved';
import { MOCK_COVERED } from './screenTime';

/** The app the person was after, if the covering screen has just noted one that Plainlimit can open. */
export function appToReturnTo(now: Date): AppLink | null {
  if (MOCK_COVERED) return linkFor({ name: 'Snapchat', bundle: '' });
  if (Platform.OS !== 'ios') return null;
  const covered = asCovered(coveredApp(), now.getTime());
  return covered ? linkFor(covered) : null;
}

/**
 * Opens it. False when the phone has no app for the link (not installed any
 * more, or the link has changed): the screen then says to go back by hand.
 */
export async function returnTo(app: AppLink): Promise<boolean> {
  if (MOCK_COVERED) {
    // The preview only notes what would have opened, for the browser checks.
    (globalThis as { plainlimitOpened?: string }).plainlimitOpened = app.link;
    return true;
  }
  try {
    await Linking.openURL(app.link);
    return true;
  } catch {
    return false;
  }
}
