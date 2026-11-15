import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAttachmentUri } from '@/platform/attachments';
import { Icon } from '@/ui/Icon';

/** A walk-through video, full screen, with the system's own controls. */
export default function VideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name: string }>();
  const uri = useAttachmentUri(typeof name === 'string' ? name : null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} testID="video-screen">
      <StatusBar style="light" />
      {uri ? (
        <Player uri={uri} />
      ) : (
        <Text style={{ color: '#bbb', textAlign: 'center', marginTop: 160, paddingHorizontal: 32, fontSize: 16 }}>Loading the video…</Text>
      )}
      <Pressable testID="video-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close} style={[styles.close, { top: insets.top + 12 }]}>
        <Icon name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView testID="video-player" player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(60,60,60,0.8)', alignItems: 'center', justifyContent: 'center' },
});
