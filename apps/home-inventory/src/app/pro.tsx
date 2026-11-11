import { Stack, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FREE_ITEM_LIMIT } from '@/domain/limits';
import { success } from '@/platform/haptics';
import { EXPECTED_PRICE } from '@/pro/config';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { useDoc } from '@/state/store';
import { notify } from '@/ui/dialogs';
import { Icon, type IconName } from '@/ui/Icon';
import { BarButton, Button, Notice } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'box', text: 'As many items as your home holds' },
  { icon: 'key', text: 'Pay once. It is yours for good, with no subscription' },
  { icon: 'lock', text: 'Still no account, and nothing leaves your iPhone' },
];

export default function ProScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const doc = useDoc();
  const state = usePro();
  const used = Math.min(doc.items.length, FREE_ITEM_LIMIT);
  const full = doc.items.length >= FREE_ITEM_LIMIT;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const buy = async () => {
    const result = await pro.buy();
    if (result === 'purchased') {
      success();
      close();
    } else if (result === 'failed') {
      await notify('The purchase didn’t go through', 'You have not been charged. Try again in a moment.');
    }
  };

  const restore = async () => {
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      close();
    } else if (result === 'nothing') {
      await notify('No purchase found', 'This Apple Account hasn’t bought Roomfile Pro.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: '', headerLeft: () => <BarButton testID="pro-close" label="Close" onPress={close} /> }} />
      <ScrollView testID="pro-screen" contentContainerStyle={{ paddingHorizontal: space.xxl, paddingTop: space.l, paddingBottom: space.xxl }}>
        <Text style={[type.caption, { color: c.green, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' }]}>Roomfile Pro</Text>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink, marginTop: space.s }]}>
          {state.isPro ? 'Pro is unlocked.' : 'Room for everything.'}
        </Text>
        <Text testID="pro-status" style={[type.body, { color: c.ink2, marginTop: space.m }]}>
          {state.isPro
            ? 'Thank you. Add as many items as you like.'
            : full
              ? `The free version holds ${FREE_ITEM_LIMIT} items, and yours is full. Everything you have added stays, and the report and backups keep working.`
              : `The free version holds ${FREE_ITEM_LIMIT} items with every feature. You have used ${used}.`}
        </Text>

        <View style={{ marginTop: space.xxl, gap: space.l }}>
          {POINTS.map((p) => (
            <View key={p.text} style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={p.icon} size={17} color={c.green} />
              </View>
              <Text style={[type.callout, { color: c.ink, flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {state.isPro ? null : (
        <View style={{ paddingHorizontal: space.xxl, paddingBottom: insets.bottom + space.l, gap: space.xs }}>
          {state.storeOpen ? null : (
            <Notice icon="info">
              Purchases aren’t switched on in this test build, so nothing can be bought here.
              {DEV_TOOLS ? ' To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.' : ''}
            </Notice>
          )}
          <Button
            testID="pro-buy"
            label={`Unlock Pro · ${state.price ?? EXPECTED_PRICE}`}
            disabled={!state.storeOpen}
            busy={state.busy}
            onPress={buy}
            style={{ marginTop: space.m }}
          />
          <Button testID="pro-restore" label="Restore purchase" kind="plain" disabled={!state.storeOpen || state.busy} onPress={restore} />
          <Text style={[type.footnote, { color: c.ink2, textAlign: 'center' }]}>A one-time purchase through the App Store.</Text>
        </View>
      )}
    </View>
  );
}
