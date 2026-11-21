import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { Category, Photo } from '@/domain/types';
import { CATEGORY_INFO } from '@/domain/categories';
import { photoUri } from '@/platform/photos';

import { CategoryIcon } from './Icon';
import { SceneArt } from './SceneArt';
import { useTheme } from './theme';

// One picture, wherever it comes from: a kept photo, or one of the sample
// map's drawn stand-ins.

export function usePhotoUri(photo: Photo | null | undefined): string | null {
  const file = photo && photo.kind === 'file' ? photo.file : null;
  // The answer is kept with the file it belongs to, so a new photo never shows the last one's picture.
  const [found, setFound] = useState<{ file: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    void photoUri(file).then((uri) => {
      if (live) setFound({ file, uri });
    });
    return () => {
      live = false;
    };
  }, [file]);
  return found && found.file === file ? found.uri : null;
}

export function PhotoView({ photo, style, fit = 'cover', testID }: { photo: Photo; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain'; testID?: string }) {
  const { c } = useTheme();
  const uri = usePhotoUri(photo);
  if (photo.kind === 'art') {
    return (
      <View testID={testID} style={[{ overflow: 'hidden', backgroundColor: c.sunk }, style]}>
        <SceneArt scene={photo.scene} seed={photo.seed} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  return (
    <View testID={testID} style={[{ overflow: 'hidden', backgroundColor: c.sunk }, style]}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit={fit} transition={120} recyclingKey={photo.id} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** What stands where a cover would be when a place has no photos yet: its kind, in its own ink. */
export function NoPhoto({ category, style, iconSize = 30 }: { category: Category; style?: StyleProp<ViewStyle>; iconSize?: number }) {
  const { dark } = useTheme();
  const info = CATEGORY_INFO[category];
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: info.color + (dark ? '38' : '26') }, style]}>
      <CategoryIcon category={category} size={iconSize} color={info.color} />
    </View>
  );
}
