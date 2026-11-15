import { native } from './native';

// Reading the text in a photo, on the iPhone (Apple's Vision, nothing leaves
// the phone). Missing in Expo Go and on the web preview, where `canScan` is false
// and the form shows no scan buttons. The rules that pick a serial number or a
// receipt's total out of the text are in src/domain/scan.ts.

export const canScan = native !== null;

/** The lines of text in the picture, top to bottom. Empty if there is none or it could not be read. */
export async function readTextIn(uri: string): Promise<string[]> {
  if (!native) return [];
  try {
    return await native.recognizeText(uri);
  } catch {
    return [];
  }
}
