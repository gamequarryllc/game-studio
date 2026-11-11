import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { pro, usePro } from '@/pro/pro';
import { store, useStore } from '@/state/store';
import { DialogHost } from '@/ui/dialogs';
import { useTheme } from '@/ui/theme';

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

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Newsreader_500Medium, Newsreader_600SemiBold });
  const loaded = useStore().state === 'ready';
  const proReady = usePro().ready;

  useEffect(() => {
    void store.start();
    void pro.start();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && loaded && proReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useWebDeepLink(ready);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.paper }} />;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.green, background: c.paper, card: c.paper, text: c.ink, border: c.rule, notification: c.red },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* On a wide browser window the preview keeps the proportions of a phone. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? (dark ? '#060606' : '#E3DED2') : c.paper }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: c.paper, overflow: 'hidden' }}>
          <Stack
            screenOptions={{
              headerTintColor: c.green,
              headerStyle: { backgroundColor: c.paper },
              headerShadowVisible: false,
              headerTitleStyle: { color: c.ink, fontWeight: '600' },
              headerTitleAlign: 'center',
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: c.paper },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Plainproof' }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', title: 'Welcome' }} />
            <Stack.Screen name="room/[id]" options={{ title: '' }} />
            <Stack.Screen name="item/[id]" options={{ title: '' }} />
            <Stack.Screen name="item-form" options={{ presentation: 'modal', title: 'New item' }} />
            <Stack.Screen name="pro" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="places" options={{ presentation: 'modal', title: 'Places' }} />
            <Stack.Screen name="photo" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Photo' }} />
            <Stack.Screen name="+not-found" options={{ title: '' }} />
          </Stack>
          <DialogHost />
        </View>
      </View>
    </ThemeProvider>
  );
}
