import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { onNoticeRoute } from '@/platform/notices';
import { store, useStore } from '@/state/store';
import { c } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The studio site can only serve the preview's front page. When someone
 * reloads a deeper page, the site sends them back here with the page they
 * wanted in "?p=", and this puts them on it.
 */
function useWebDeepLink(ready: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ready || Platform.OS !== 'web') return;
    const wanted = new URLSearchParams(window.location.search).get('p');
    if (wanted && wanted.startsWith('/') && !wanted.startsWith('//')) router.replace(wanted as never);
  }, [ready, router]);
}

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: c.ink, background: c.ground, card: c.ground, text: c.ink, border: c.rule, notification: c.ink },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  const loaded = useStore().state === 'ready';

  useEffect(() => {
    void store.start();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && loaded;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useWebDeepLink(ready);
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    return onNoticeRoute((route) => router.push(route));
  }, [ready, router]);
  // A first launch goes through setup before anything else.
  const setupDone = useStore().doc.setupDone;
  const pathname = usePathname();
  useEffect(() => {
    if (ready && !setupDone && pathname !== '/setup') router.replace('/setup');
  }, [ready, setupDone, pathname, router]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.ground }} />;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      {/* On a wide browser window the preview keeps the proportions of a phone. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#050606' : c.ground }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: c.ground, overflow: 'hidden' }}>
          <Stack
            screenOptions={{
              headerTintColor: c.ink,
              headerStyle: { backgroundColor: c.ground },
              headerShadowVisible: false,
              headerTitleStyle: { color: c.ink, fontWeight: '600' },
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: c.ground },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Today' }} />
            <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false, animation: 'fade', title: 'Set up Plainlimit' }} />
            <Stack.Screen name="what-counts" options={{ title: '' }} />
            <Stack.Screen name="puzzle" options={{ presentation: 'modal', headerShown: false, title: 'Earn more time' }} />
            <Stack.Screen name="screens/warning" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Warning screen' }} />
            <Stack.Screen name="screens/empty" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Empty screen' }} />
            <Stack.Screen name="+not-found" options={{ title: '' }} />
          </Stack>
        </View>
      </View>
    </ThemeProvider>
  );
}
