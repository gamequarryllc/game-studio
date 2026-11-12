import { BarlowCondensed_500Medium } from '@expo-google-fonts/barlow-condensed/500Medium';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { onReminderOpened } from '@/platform/notify';
import { pro, usePro } from '@/pro/pro';
import { reminders } from '@/state/reminders';
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

/** A tapped reminder opens the job it was about. */
function useReminderLinks(ready: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    return onReminderOpened((target) => {
      const doc = store.get();
      if (target.jobId && doc.jobs.some((j) => j.id === target.jobId)) router.push({ pathname: '/job/[id]', params: { id: target.jobId } });
      else if (target.thingId && doc.things.some((t) => t.id === target.thingId)) router.push({ pathname: '/thing/[id]', params: { id: target.thingId } });
    });
  }, [ready, router]);
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_500Medium, BarlowCondensed_600SemiBold });
  const loaded = useStore().state === 'ready';
  const proReady = usePro().ready;

  useEffect(() => {
    void store.start().then(() => reminders.start());
    void pro.start();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && loaded && proReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useWebDeepLink(ready);
  useReminderLinks(ready);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.page }} />;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.blue, background: c.page, card: c.page, text: c.ink, border: c.rule, notification: c.red },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* On a wide browser window the preview keeps the proportions of a phone. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? (dark ? '#050607' : '#D9DDDB') : c.page }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: c.page, overflow: 'hidden' }}>
          <Stack
            screenOptions={{
              headerTintColor: c.blue,
              headerStyle: { backgroundColor: c.page },
              headerShadowVisible: false,
              headerTitleStyle: { color: c.ink, fontWeight: '600' },
              headerTitleAlign: 'center',
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: c.page },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Plainkeep' }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', title: 'Welcome' }} />
            <Stack.Screen name="thing/[id]" options={{ title: '' }} />
            <Stack.Screen name="job/[id]" options={{ title: '' }} />
            <Stack.Screen name="coming" options={{ title: 'Coming reminders' }} />
            <Stack.Screen name="thing-form" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="suggestions" options={{ presentation: 'modal', title: 'Suggested jobs' }} />
            <Stack.Screen name="job-form" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="done" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="odometer" options={{ presentation: 'modal', title: 'Odometer' }} />
            <Stack.Screen name="pro" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="+not-found" options={{ title: '' }} />
          </Stack>
          <DialogHost />
        </View>
      </View>
    </ThemeProvider>
  );
}
