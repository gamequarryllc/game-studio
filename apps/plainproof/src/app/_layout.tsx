import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { switchPlace } from '@/domain/library';
import { onReminderOpened } from '@/platform/notify';
import { pro, usePro } from '@/pro/pro';
import { cloudBackup } from '@/state/cloudBackup';
import { reminders } from '@/state/reminders';
import { store, useStore } from '@/state/store';
import { DialogHost } from '@/ui/dialogs';
import { RecoveryScreen } from '@/ui/Recovery';
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

/** A tapped reminder opens what it was about: the item whose warranty ends, the backup, or the rooms. */
function useReminderLinks(ready: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    return onReminderOpened((target) => {
      const lib = store.library();
      if (target.placeId && target.placeId !== lib.currentId && lib.places.some((p) => p.id === target.placeId)) {
        const placeId = target.placeId;
        store.updateLibrary((l) => switchPlace(l, placeId));
      }
      const doc = store.get();
      if (target.kind === 'warranty' && target.itemId && doc.items.some((i) => i.id === target.itemId)) router.push({ pathname: '/item/[id]', params: { id: target.itemId } });
      else if (target.kind === 'backup') router.push({ pathname: '/report', params: { show: 'backup', at: String(Date.now()) } });
      else router.push('/');
    });
  }, [ready, router]);
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Newsreader_500Medium, Newsreader_600SemiBold });
  const storeState = useStore().state;
  const loaded = storeState !== 'loading';
  const proReady = usePro().ready;

  useEffect(() => {
    void store.start().then(() => {
      reminders.start();
      cloudBackup.start();
    });
    void pro.start();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && loaded && proReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useWebDeepLink(ready);
  useReminderLinks(ready && storeState === 'ready');

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
          {storeState === 'failed' ? (
            <RecoveryScreen />
          ) : (
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
            <Stack.Screen name="claim/[id]" options={{ title: 'Claim' }} />
            <Stack.Screen name="claim-items" options={{ presentation: 'modal', title: 'Items in the claim' }} />
            <Stack.Screen name="policy" options={{ title: 'Policy and coverage' }} />
            <Stack.Screen name="photo" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Photo' }} />
            <Stack.Screen name="video" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade', title: 'Video' }} />
            <Stack.Screen name="+not-found" options={{ title: '' }} />
          </Stack>
          )}
          <DialogHost />
        </View>
      </View>
    </ThemeProvider>
  );
}
