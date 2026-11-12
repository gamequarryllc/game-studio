import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setSettings } from '@/domain/actions';
import type { ThingKind } from '@/domain/types';
import { store } from '@/state/store';
import { Button } from '@/ui/kit';
import { TagArt } from '@/ui/TagArt';
import { NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const begin = (kind: ThingKind | null) => {
    store.update((d, now) => setSettings(d, { onboarded: true }, now));
    router.replace('/');
    if (kind) router.push({ pathname: '/thing-form', params: { kind, first: '1' } });
  };

  return (
    <ScrollView
      testID="welcome-screen"
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xxl }}>
      <View style={{ flex: 1, justifyContent: 'center', minHeight: 420 }}>
        <View style={{ marginLeft: -18 }}>
          <TagArt width={250} />
        </View>
        <Text accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, marginTop: space.xl, fontSize: 44, lineHeight: 44 }]}>
          Know what’s due on the house and the car.
        </Text>
        <Text style={[type.body, { color: c.ink2, marginTop: space.m }]}>
          Filters, batteries, oil changes, registrations. Plainkeep remembers when each was last done and tells you before it comes round again.
        </Text>
      </View>
      <View style={{ gap: space.s, marginTop: space.xxl }}>
        <Button testID="welcome-home" label="Start with my home" onPress={() => begin('home')} />
        <Button testID="welcome-car" label="Start with a car" kind="soft" onPress={() => begin('vehicle')} />
        <Button testID="welcome-skip" label="Look around first" kind="plain" onPress={() => begin(null)} />
        <Text style={[type.footnote, { color: c.ink2, textAlign: 'center', marginTop: space.xs }]}>No account. Nothing leaves this iPhone.</Text>
      </View>
    </ScrollView>
  );
}
