import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FREE_PHOTO_LIMIT, FREE_PLACE_LIMIT } from '@/domain/limits';
import { LIMITS } from '@/domain/types';
import { success } from '@/platform/haptics';
import { EXPECTED_PRICE } from '@/pro/config';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { useDoc } from '@/state/store';
import { notify } from '@/ui/dialogs';
import { Icon, type IconName } from '@/ui/Icon';
import { BarButton, Button } from '@/ui/kit';
import { SceneArt } from '@/ui/SceneArt';
import { HAIRLINE, NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

const POINTS: { icon: IconName; title: string; body: string; free?: string }[] = [
  { icon: 'pin', title: 'Every place you’ve been', body: 'No limit on pins.', free: `Free holds ${FREE_PLACE_LIMIT}.` },
  { icon: 'photo', title: `${LIMITS.photos} photos on each place`, body: 'Room for the whole trip.', free: `Free holds ${FREE_PHOTO_LIMIT}.` },
  { icon: 'globe', title: 'The satellite globe', body: 'Your pins on the real Earth, seen from above.' },
];

/** Three prints fanned out, the way a trip's photos land on a table. */
function Prints() {
  const tilt = ['-8deg', '3deg', '11deg'];
  const scenes = ['dunes', 'lighthouse', 'mountain'] as const;
  return (
    <View accessible accessibilityLabel="Three travel photos" style={{ height: 150, alignItems: 'center', justifyContent: 'center', marginTop: space.l }}>
      {scenes.map((scene, i) => (
        <View key={scene} style={{ position: 'absolute', left: '50%', marginLeft: -62 + (i - 1) * 78, padding: 5, paddingBottom: 14, backgroundColor: '#FFFFFF', borderRadius: 3, transform: [{ rotate: tilt[i] }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
          <SceneArt scene={scene} seed={7 + i * 5} style={{ width: 112, height: 96 }} />
        </View>
      ))}
    </View>
  );
}

/** Where there is no store (the web preview) the button says so when asked, rather than doing nothing. */
const NO_STORE_TITLE = 'Purchases aren’t switched on in this build';
const NO_STORE_BODY = DEV_TOOLS ? 'Nothing can be bought here. To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.' : 'Nothing can be bought here.';

export default function ProScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { why } = useLocalSearchParams<{ why?: string }>();
  const held = useDoc().places.length;
  const state = usePro();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // The price comes from the App Store. If the phone was offline when the app started, ask again now.
  useEffect(() => {
    void pro.refreshPrice();
  }, []);
  // Where there is a store, only its own price is ever shown: the draft price would be wrong in another country.
  const price = state.price ?? (state.storeOpen ? null : EXPECTED_PRICE);

  const buy = async () => {
    if (!state.storeOpen) {
      await notify(NO_STORE_TITLE, NO_STORE_BODY);
      return;
    }
    const result = await pro.buy();
    if (result === 'purchased') {
      success();
      close();
    } else if (result === 'pending') {
      await notify('Waiting for approval', 'Pro unlocks on this iPhone as soon as the purchase is approved.');
    } else if (result === 'unavailable') {
      await notify('The App Store couldn’t be reached', 'Pro can’t be bought right now. Check your connection and try again.');
    } else if (result === 'failed') {
      await notify('The purchase didn’t go through', 'You have not been charged. Try again in a moment.');
    }
  };

  const restore = async () => {
    if (!state.storeOpen) {
      await notify(NO_STORE_TITLE, 'There is nothing to restore here. In the App Store version this brings back Pro on a new iPhone.');
      return;
    }
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      close();
    } else if (result === 'nothing') {
      await notify('No purchase found', 'This Apple Account hasn’t bought Pro for this app.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  const status = state.isPro
    ? 'Thank you. Pin as many places as you like.'
    : why === 'places' || held >= FREE_PLACE_LIMIT
      ? `The free version holds ${FREE_PLACE_LIMIT} places, and you have ${held}. Everything you’ve pinned stays on the map and keeps working.`
      : why === 'photos'
        ? `The free version holds ${FREE_PHOTO_LIMIT} photos on each place. The ones you’ve added stay.`
        : why === 'satellite'
          ? 'The satellite globe is part of Pro. The street map, and its globe, are yours either way.'
          : held > 0 ? `Everything the app does is free for your first ${FREE_PLACE_LIMIT} places. You have ${held}.` : `Everything the app does is free for your first ${FREE_PLACE_LIMIT} places.`;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ title: 'Pro', headerLeft: () => <BarButton testID="pro-close" label="Close" onPress={close} /> }} />
      <ScrollView testID="pro-screen" contentContainerStyle={{ paddingHorizontal: space.xxl, paddingTop: space.s, paddingBottom: space.xl }}>
        <Prints />
        <Text accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, marginTop: space.l }]}>
          {state.isPro ? 'Pro is unlocked.' : 'Room for everywhere you go.'}
        </Text>
        <Text testID="pro-status" style={[type.body, { color: c.ink2, marginTop: space.m }]}>
          {status}
        </Text>

        <View style={{ marginTop: space.l }}>
          {POINTS.map((p) => (
            <View key={p.title} style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: HAIRLINE, borderTopColor: c.rule }}>
              <Icon name={p.icon} size={19} color={c.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: c.ink }]}>{p.title}</Text>
                <Text style={[type.subhead, { color: c.ink2, marginTop: 1 }]}>{state.isPro || !p.free ? p.body : `${p.body} ${p.free}`}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      {state.isPro ? null : (
        <View style={{ paddingHorizontal: space.xxl, paddingTop: space.m, paddingBottom: insets.bottom + space.m, gap: space.xs, borderTopWidth: HAIRLINE, borderTopColor: c.rule, backgroundColor: c.page }}>
          <Button testID="pro-buy" label={price ? `Unlock Pro · ${price} once` : 'Unlock Pro'} busy={state.busy} onPress={buy} />
          <Button testID="pro-restore" label="Restore purchase" kind="plain" disabled={state.busy} onPress={restore} />
          <Text style={[type.footnote, { color: c.ink2, textAlign: 'center' }]}>Pay once, keep it. No subscription, no account.</Text>
        </View>
      )}
    </View>
  );
}
