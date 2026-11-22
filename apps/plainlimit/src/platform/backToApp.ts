/**
 * Straight back to the app after a Second thought sum (see
 * src/domain/appLinks.ts for why and how). The covering screen's two
 * extensions note which app a lock was shown on and which screen's button was
 * pressed; this reads the notes and opens that app by its own link. Nothing
 * here leaves the phone.
 */

import { Linking, Platform } from 'react-native';

import { appAfter, asCovered, asTapped, linkFor, readout, type AppLink, type Covered, type Tapped } from '@/domain/appLinks';

import { waitingData } from './notices';
import { coveredApp, tappedApp } from './saved';
import { MOCK_COVERED } from './screenTime';

/** The notification the covering screen's extension leaves its note on. It has no words and is never shown. */
const WAITING_NOTE = 'plainlimit-covered';

/** The app to go back to, if there is one Plainlimit can open, and what the notes held (four lines, for the readout). */
export interface Back {
  app: AppLink | null;
  readout: string[];
}

function backFrom(at: number, tapped: Tapped | null, saved: Covered | null, waiting: Covered | null): Back {
  const chosen = appAfter(at, tapped, [saved, waiting]);
  const app = chosen.app ? linkFor(chosen.app) : null;
  return { app, readout: readout(at, tapped, saved, waiting, chosen, app) };
}

/** The preview's "?mock=...,covered": a covering screen drawn for Snapchat a few seconds ago, and its button pressed. */
function mocked(at: number): Back {
  const snapchat: Covered = { name: 'Snapchat', bundle: 'com.toyopagroup.picaboo', key: 'preview', category: '', at: at - 6_000 };
  return backFrom(at, { kind: 'app', key: 'preview', name: '', bundle: '', at: at - 4_000 }, snapchat, snapchat);
}

/** From the shared settings alone, which can be read at once: enough for the sum's button to name the app as the screen opens. */
export function appToReturnTo(now: Date): Back {
  if (MOCK_COVERED) return mocked(now.getTime());
  if (Platform.OS !== 'ios') return { app: null, readout: [] };
  return backFrom(now.getTime(), asTapped(tappedApp()), asCovered(coveredApp()), null);
}

/** The same, with the note left on the waiting notification as well: a moment later. */
export async function appToReturnToWithWaiting(now: Date): Promise<Back> {
  if (MOCK_COVERED) return mocked(now.getTime());
  if (Platform.OS !== 'ios') return { app: null, readout: [] };
  const data = await waitingData(WAITING_NOTE);
  const waiting = data && typeof data === 'object' ? asCovered((data as Record<string, unknown>).plainlimitCovered) : null;
  return backFrom(now.getTime(), asTapped(tappedApp()), asCovered(coveredApp()), waiting);
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
