import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FREE_THING_LIMIT } from '@/domain/limits';
import { success } from '@/platform/haptics';
import { EXPECTED_PRICE } from '@/pro/config';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { useDoc } from '@/state/store';
import { notify } from '@/ui/dialogs';
import { Icon } from '@/ui/Icon';
import { BarButton, Button } from '@/ui/kit';
import { HAIRLINE, NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

const POINTS: { title: string; body: string }[] = [
  { title: 'As many things as you have', body: 'A second car, a rental, a cabin, the mower and the boat.' },
  { title: 'A service record for each', body: 'Everything logged, as a PDF: for a buyer, a landlord or a warranty claim.' },
];

/** A small drawing of what Pro makes: the first page of a service record. */
function RecordArt() {
  const { c, dark } = useTheme();
  const paper = dark ? '#F1F3F2' : '#FFFFFF';
  const line = '#C9CFCC';
  const bar = (w: number, color = line, h = 4) => <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }} />;
  return (
    <View accessible accessibilityLabel="A service record page" style={{ width: 132, backgroundColor: paper, borderRadius: 4, padding: 12, gap: 7, borderWidth: HAIRLINE, borderColor: c.rule, transform: [{ rotate: '-3deg' }] }}>
      {bar(34, '#1D4F7C', 3)}
      {bar(70, '#161A1E', 8)}
      <View style={{ height: 2, backgroundColor: '#1D4F7C', marginBottom: 2 }} />
      {[62, 48, 70, 40, 56].map((w, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {bar(w)}
          {bar(18)}
        </View>
      ))}
      <View style={{ height: HAIRLINE, backgroundColor: '#161A1E' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {bar(26, '#161A1E')}
        {bar(22, '#161A1E')}
      </View>
    </View>
  );
}

/** Where there is no store (the web preview) the button says so when asked, rather than doing nothing. */
const NO_STORE_TITLE = 'Purchases aren’t switched on in this build';
const NO_STORE_BODY = DEV_TOOLS ? 'Nothing can be bought here. To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.' : 'Nothing can be bought here.';

export default function ProScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const held = useDoc().things.length;
  const state = usePro();
  const full = held >= FREE_THING_LIMIT;
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
      await notify('The App Store couldn’t be reached', 'Plainkeep Pro can’t be bought right now. Check your connection and try again.');
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
      await notify('No purchase found', 'This Apple Account hasn’t bought Plainkeep Pro.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ title: 'Plainkeep Pro', headerLeft: () => <BarButton testID="pro-close" label="Close" onPress={close} /> }} />
      <ScrollView testID="pro-screen" contentContainerStyle={{ paddingHorizontal: space.xxl, paddingTop: space.l, paddingBottom: space.xl }}>
        <Text accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink }, width < 360 ? { fontSize: 32, lineHeight: 38 } : null]}>
          {state.isPro ? 'Pro is unlocked.' : 'Room for the whole household.'}
        </Text>
        <Text testID="pro-status" style={[type.body, { color: c.ink2, marginTop: space.m }]}>
          {state.isPro
            ? 'Thank you. Add as many things as you have.'
            : full
              ? `Free looks after ${FREE_THING_LIMIT} things, and you have ${held}. Everything you have added stays and keeps working.`
              : `Free looks after ${FREE_THING_LIMIT} things, a home and a car say, with everything they need. You have ${held}.`}
        </Text>

        <View style={{ marginTop: space.xl }}>
          {POINTS.map((p) => (
            <View key={p.title} style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start', paddingVertical: space.s }}>
              <Icon name="check" size={17} color={c.blue} style={{ marginTop: 3 }} />
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: c.ink }]}>{p.title}</Text>
                <Text style={[type.subhead, { color: c.ink2, marginTop: 1 }]}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          <RecordArt />
        </View>

      </ScrollView>
      {state.isPro ? null : (
        <View style={{ paddingHorizontal: space.xxl, paddingTop: space.m, paddingBottom: insets.bottom + space.m, gap: space.xs, borderTopWidth: HAIRLINE, borderTopColor: c.rule, backgroundColor: c.page }}>
          <Button testID="pro-buy" label={price ? `Unlock Pro · ${price} once` : 'Unlock Pro'} busy={state.busy} onPress={buy} />
          <Button testID="pro-restore" label="Restore purchase" kind="plain" disabled={state.busy} onPress={restore} />
          <Text style={[type.footnote, { color: c.ink2, textAlign: 'center' }]}>No subscription. Still no account, and nothing leaves your iPhone.</Text>
        </View>
      )}
    </View>
  );
}
