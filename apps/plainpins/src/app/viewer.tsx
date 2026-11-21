import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoc } from '@/state/store';
import { Icon } from '@/ui/Icon';
import { PhotoView } from '@/ui/PhotoView';
import { serif, type } from '@/ui/theme';

// A place's photos, one to a screen. Swipe between them; pinch to look closer.

export default function Viewer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const place = useDoc().places.find((p) => p.id === id);
  const start = Math.max(0, Math.min((place?.photos.length ?? 1) - 1, Number(index) || 0));
  const [page, setPage] = useState(start);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const width = Math.min(window.width, 480);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    // The web's scroller has no starting offset, so it is moved once it exists.
    if (Platform.OS === 'web' && start > 0) pager.current?.scrollTo({ x: start * width, animated: false });
  }, [start, width]);

  if (!place || place.photos.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Pressable accessibilityRole="button" onPress={close}>
          <Text style={[type.body, { color: '#FFFDF8' }]}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.max(0, Math.min(place.photos.length - 1, Math.round(e.nativeEvent.contentOffset.x / width))));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} testID="viewer">
      <StatusBar style="light" />
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: start * width, y: 0 }} onScroll={onScroll} scrollEventThrottle={32}>
        {place.photos.map((photo) => (
          <ScrollView
            key={photo.id}
            style={{ width, height: window.height }}
            contentContainerStyle={{ width, height: window.height, alignItems: 'center', justifyContent: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bouncesZoom
            centerContent>
            <PhotoView photo={photo} fit="contain" style={{ width, height: photo.kind === 'art' ? Math.round(width * 0.75) : window.height, backgroundColor: '#000' }} />
          </ScrollView>
        ))}
      </ScrollView>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, top: insets.top + (Platform.OS === 'web' ? 14 : 6), flexDirection: 'row', alignItems: 'center' }}>
        <Pressable testID="viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}>
          <Icon name="close" size={18} color="#FFFDF8" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text testID="viewer-count" style={[type.margin, { color: 'rgba(255,253,248,0.8)' }]}>{`${page + 1} of ${place.photos.length}`}</Text>
      </View>

      <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 22 }}>
        <Text style={{ fontFamily: serif.regular, fontSize: 24, lineHeight: 28, color: '#FFFDF8' }} numberOfLines={2}>
          {place.name}
        </Text>
      </View>
    </View>
  );
}
