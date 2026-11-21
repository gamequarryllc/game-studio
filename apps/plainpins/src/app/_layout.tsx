import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { photoFiles } from '@/domain/doc';
import { sweepPhotos } from '@/platform/photos';
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
  const [fontsLoaded, fontError] = useFonts({ InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });
  const loaded = useStore().state === 'ready';
  const proReady = usePro().ready;

  useEffect(() => {
    // Photos left behind by a form that was never saved are cleared out once the map is read.
    void store.start().then(() => sweepPhotos(photoFiles(store.get())));
    void pro.start();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && loaded && proReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useWebDeepLink(ready);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.page }} />;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.page, card: c.page, text: c.ink, border: c.rule, notification: c.accent },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* On a wide browser window the preview keeps the proportions of a phone. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? (dark ? '#04060B' : '#DCD5C4') : c.page }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: c.page, overflow: 'hidden' }}>
          <Stack
            screenOptions={{
              headerTintColor: c.accent,
              headerStyle: { backgroundColor: c.page },
              headerShadowVisible: false,
              headerTitleStyle: { color: c.ink, fontWeight: '600' },
              headerTitleAlign: 'center',
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: c.page },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Map' }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', title: 'Welcome' }} />
            <Stack.Screen name="place/[id]" options={{ headerShown: false, title: '' }} />
            <Stack.Screen name="place-form" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="viewer" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Photo' }} />
            <Stack.Screen name="pro" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="sample" options={{ title: 'Sample map' }} />
            <Stack.Screen name="+not-found" options={{ title: '' }} />
          </Stack>
          <DialogHost />
        </View>
      </View>
    </ThemeProvider>
  );
}
