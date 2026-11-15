// The web preview has no native module: every feature that needs it says what the iPhone does instead.

export interface FolderInfo {
  name: string;
  inCloud: boolean;
}

export interface PickedFolder extends FolderInfo {
  bookmark: string;
}

export interface SavedToFolder {
  bookmark: string | null;
}

export const native: null = null;
