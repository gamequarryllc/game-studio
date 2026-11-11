import AsyncStorage from '@react-native-async-storage/async-storage';

// Everything the app remembers is one small piece of JSON kept on the phone
// (in the browser, for the web preview). Nothing is sent anywhere.

const KEY = 'screen-battery.doc.v1';

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
