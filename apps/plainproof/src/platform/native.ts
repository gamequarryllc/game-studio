import { requireOptionalNativeModule } from 'expo';

// The app's own small native module (modules/plainproof-native): the few
// things the iPhone can do that no Expo library does. It is only in a real
// build (TestFlight, the App Store); in Expo Go it is missing and each feature
// that needs it says so. The web preview has none: native.web.ts.

export interface FolderInfo {
  /** The folder's name as Files shows it. */
  name: string;
  /** True when the folder is in iCloud Drive (or another cloud the Files app syncs). */
  inCloud: boolean;
}

export interface PickedFolder extends FolderInfo {
  /** Lets the app find the folder again after a restart. Kept only on this iPhone. */
  bookmark: string;
}

export interface SavedToFolder {
  /** A fresh bookmark when iOS says the old one is out of date; keep it. */
  bookmark: string | null;
}

interface PlainproofNative {
  /** The text in a photo, line by line, read on the phone by Apple's Vision. */
  recognizeText(uri: string): Promise<string[]>;
  /** When a video was recorded (ms), from the file itself. */
  mediaDate(uri: string): Promise<number | null>;
  /** Shows a PDF or picture full screen (Quick Look), with the system's share button. */
  preview(uri: string, title: string): Promise<void>;
  /** Lets the person choose a folder in Files. Null if they back out. */
  pickFolder(): Promise<PickedFolder | null>;
  /** The folder a bookmark points at, or null if it is gone. */
  folderInfo(bookmark: string): Promise<FolderInfo | null>;
  /** Copies a file into the folder under `fileName`; the copy already there becomes `previousName`. */
  saveToFolder(bookmark: string, sourceUri: string, fileName: string, previousName: string): Promise<SavedToFolder>;
}

export const native: PlainproofNative | null = requireOptionalNativeModule<PlainproofNative>('PlainproofNative');
