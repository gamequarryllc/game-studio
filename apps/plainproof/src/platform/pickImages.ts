import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from './photos';

function toPicked(result: ImagePicker.ImagePickerResult): PickedImage[] {
  if (result.canceled) return [];
  return result.assets.map((a) => ({ uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 }));
}

/** Opens the photo library. Returns nothing if the person backs out. */
export async function pickFromLibrary(limit: number): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 0.9,
    exif: false,
  });
  return toPicked(result);
}

/** Opens the camera. 'denied' means the person has said no to camera access. */
export async function takePhoto(): Promise<PickedImage[] | 'denied'> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
  return toPicked(result);
}
