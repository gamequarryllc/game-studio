import { useRouter } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
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
  // On a short phone the picture goes, so the three buttons are on the first screen.
  const short = useWindowDimensions().height < 620;
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
      <View style={{ flex: 1, justifyContent: 'center', minHeight: short ? 0 : 420 }}>
        {short ? null : (
          <View style={{ marginLeft: -66 }}>
            <TagArt width={250} />
          </View>
        )}
        <Text accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, marginTop: space.xl, fontSize: short ? 36 : 44, lineHeight: short ? 41 : 50 }]}>
          Know what’s due on the house and the car.
        </Text>
        <Text style={[type.body, { color: c.ink2, marginTop: space.m }]}>
          Filters, batteries, oil changes, registrations. Plainkeep remembers when each was last done and reminds you before it’s due again.
        </Text>
      </View>
      <View style={{ gap: space.s, marginTop: short ? space.l : space.xxl }}>
        <Button testID="welcome-home" label="Start with a home" onPress={() => begin('home')} />
        <Button testID="welcome-car" label="Start with a car" kind="soft" onPress={() => begin('vehicle')} />
        <Button testID="welcome-skip" label="Look around first" kind="plain" onPress={() => begin(null)} />
        <Text style={[type.footnote, { color: c.ink2, textAlign: 'center', marginTop: space.xs }]}>No account. Nothing leaves this iPhone.</Text>
      </View>
    </ScrollView>
  );
}
