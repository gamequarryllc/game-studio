import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePhotoUri } from '@/platform/photos';
import { Icon } from '@/ui/Icon';

/** One photo, as large as the screen allows, for reading a receipt or checking a detail. */
export default function PhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = usePhotoUri(id, 'full');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} testID="photo-screen">
      <StatusBar style="light" />
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
      <Pressable testID="photo-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close} style={[styles.close, { top: insets.top + 12 }]}>
        <Icon name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(60,60,60,0.8)', alignItems: 'center', justifyContent: 'center' },
});
