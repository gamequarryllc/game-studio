import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { native } from './native';

// Picking documents and videos. expo-document-picker and expo-image-picker work
// on the iPhone and in the web preview alike, so there is one version of this file.

export interface PickedFile {
  uri: string;
  name: string;
  /** Size in bytes, when the picker said. */
  size: number | null;
}

/** Opens Files to choose PDFs (the policy, a declarations page). */
export async function pickPdfs(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: true });
  if (result.canceled) return [];
  return result.assets.map((a) => ({ uri: a.uri, name: a.name || 'Policy.pdf', size: a.size ?? null }));
}

export interface PickedVideo {
  uri: string;
  ext: 'mov' | 'mp4';
  durationMs: number | null;
  bytes: number | null;
  takenAt: number | null;
}

function extOf(asset: ImagePicker.ImagePickerAsset): 'mov' | 'mp4' {
  const name = `${asset.fileName ?? ''} ${asset.uri}`.toLowerCase();
  if (asset.mimeType === 'video/quicktime' || /\.mov(\b|$)/.test(name)) return 'mov';
  return 'mp4';
}

async function toVideo(result: ImagePicker.ImagePickerResult, recordedNow: boolean): Promise<PickedVideo | null> {
  if (result.canceled || result.assets.length === 0) return null;
  const a = result.assets[0];
  let takenAt: number | null = recordedNow ? Date.now() : null;
  // A video from the library: when it was recorded, from the file itself.
  if (!recordedNow && native) takenAt = await native.mediaDate(a.uri).catch(() => null);
  // The iPhone's picker reports the length in milliseconds; the browser's in seconds (and 0 when it could not tell).
  const duration = a.duration ? (Platform.OS === 'web' ? a.duration * 1000 : a.duration) : null;
  return { uri: a.uri, ext: extOf(a), durationMs: duration, bytes: a.fileSize ?? null, takenAt };
}

/** Chooses a video from the photo library, as recorded (not re-compressed). */
export async function pickVideo(): Promise<PickedVideo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  });
  return toVideo(result, false);
}

/** Records a walk-through with the camera, at most five minutes (one room). 'denied' if the camera is switched off for the app. */
export async function recordVideo(): Promise<PickedVideo | null | 'denied'> {
  if (Platform.OS === 'web') return pickVideo();
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    // One room at a time: five minutes in full HD is a few hundred megabytes, which a backup can carry.
    videoMaxDuration: 300,
  });
  return toVideo(result, true);
}
