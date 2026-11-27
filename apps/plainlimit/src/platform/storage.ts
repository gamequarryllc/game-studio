import AsyncStorage from '@react-native-async-storage/async-storage';

// Everything the app remembers is one small piece of JSON kept on the phone
// (in the browser, for the web preview). Nothing is sent anywhere.

const KEY = 'plainlimit.doc.v1';

export async function readSaved(): Promise<unknown> {
  try {
    const text = await AsyncStorage.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function writeSaved(doc: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // A full or locked store must never stop the app; the next change tries again.
  }
}

/** A small value kept apart from the app's saved copy (which draft of setup a test build is trying: state/setupKind.ts). Null if none or unreadable. */
export async function readNote(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeNote(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Only a convenience; the default stands next time.
  }
}
