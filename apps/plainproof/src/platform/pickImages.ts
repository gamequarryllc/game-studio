import * as ImagePicker from 'expo-image-picker';

import { parseExifDate } from '@/domain/dates';

import type { PickedImage } from './photos';

/** The date taken, from the picture's EXIF. Only the date is read; location and the rest are never kept. */
function takenAt(exif: Record<string, unknown> | null | undefined, fallback: number | null): number | null {
  const e = exif ?? {};
  const nested = (e['{Exif}'] ?? {}) as Record<string, unknown>;
  const now = Date.now();
  return (
    parseExifDate(e.DateTimeOriginal ?? nested.DateTimeOriginal, e.OffsetTimeOriginal ?? nested.OffsetTimeOriginal, now) ??
    parseExifDate(e.DateTimeDigitized ?? nested.DateTimeDigitized, e.OffsetTimeDigitized ?? nested.OffsetTimeDigitized, now) ??
    fallback
  );
}

function toPicked(result: ImagePicker.ImagePickerResult, fromCamera: boolean): PickedImage[] {
  if (result.canceled) return [];
  const shotNow = fromCamera ? Date.now() : null;
  return result.assets.map((a) => ({
    uri: a.uri,
    width: a.width ?? 0,
    height: a.height ?? 0,
    takenAt: takenAt(a.exif as Record<string, unknown> | null | undefined, shotNow),
  }));
}

/** Opens the photo library. Returns nothing if the person backs out. */
export async function pickFromLibrary(limit: number): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 0.9,
    exif: true,
  });
  return toPicked(result, false);
}

/** Opens the camera. 'denied' means the person has said no to camera access. */
export async function takePhoto(): Promise<PickedImage[] | 'denied'> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: true });
  return toPicked(result, true);
}
