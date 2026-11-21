import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FREE_PLACE_LIMIT } from '@/domain/limits';
import { SAMPLE_COUNTS } from '@/domain/sample';
import { tally, tallyLine } from '@/domain/selectors';
import { success, warning } from '@/platform/haptics';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { eraseEverything, loadSample } from '@/state/operations';
import { useDoc } from '@/state/store';
import { confirm } from '@/ui/dialogs';
import { Button, Card, Divider, Footnote, MarginLabel, SwitchRow } from '@/ui/kit';
import { SceneArt } from '@/ui/SceneArt';
import { radius, space, type, useTheme } from '@/ui/theme';

// Test data: fills the map so it can be seen (and screenshotted) full. Only in
// test builds and the web preview.

export default function SampleScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDoc();
  const proState = usePro();
  const [busy, setBusy] = useState<string | null>(null);
  const count = doc.places.length;

  const load = async (size: 'starter' | 'full') => {
    if (count > 0) {
      const sure = await confirm({ title: 'Replace everything with the sample?', message: `The ${count} ${count === 1 ? 'place' : 'places'} here now will be deleted, with their photos.`, confirmLabel: 'Replace', destructive: true });
      if (!sure) return;
    }
    setBusy(size);
    // The full sample is bigger than the free version holds, so it comes with pretend Pro.
    if (size === 'full' && !proState.isPro) pro.setPretend(true);
    await loadSample(size);
    setBusy(null);
    success();
    router.dismissTo('/');
  };

  const erase = async () => {
    const sure = await confirm({ title: 'Erase everything?', message: 'Every pin, story and photo in this app will be deleted.', confirmLabel: 'Erase everything', destructive: true });
    if (!sure) return;
    warning();
    await eraseEverything();
  };

  if (!DEV_TOOLS) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}>
        <Text style={[type.body, { color: c.ink2, textAlign: 'center' }]}>The sample map is only in test builds.</Text>
      </View>
    );
  }

  return (
    <ScrollView testID="sample-screen" style={{ flex: 1, backgroundColor: c.page }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: insets.bottom + space.huge }}>
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.l, paddingTop: space.l }}>
        {(['lighthouse', 'dunes', 'garden', 'city'] as const).map((scene, i) => (
          <SceneArt key={scene} scene={scene} seed={41 + i * 13} style={{ flex: 1, aspectRatio: 0.8, borderRadius: radius.print }} />
        ))}
      </View>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.l }}>
        <Text style={[type.title, { color: c.ink }]}>A full map to look at</Text>
        <Text style={[type.body, { color: c.ink2, marginTop: space.s }]}>
          The sample is real places with made-up visits: dates, who came along and what happened. Where photos would be it has drawn pictures like the ones above, so nothing here is mistaken for a real trip.
        </Text>
        <Text testID="sample-now" style={[type.margin, { color: c.ink3, marginTop: space.l }]}>
          {count === 0 ? 'On the map now: nothing' : `On the map now: ${tallyLine(tally(doc))}`}
        </Text>
      </View>

      <View style={{ paddingHorizontal: space.l, paddingTop: space.l, gap: space.s }}>
        <Button testID="sample-full" label={`Load the full map · ${SAMPLE_COUNTS.full} places`} busy={busy === 'full'} onPress={() => load('full')} />
        <Button testID="sample-starter" kind="quiet" label={`Load a small map · ${SAMPLE_COUNTS.starter} places`} busy={busy === 'starter'} onPress={() => load('starter')} />
      </View>
      <Footnote>{`The full map is more than the free version’s ${FREE_PLACE_LIMIT} places, so loading it also turns on “Pretend Pro is bought”. The small one fits the free version.`}</Footnote>

      <MarginLabel>While testing</MarginLabel>
      <Card>
        <SwitchRow testID="sample-pretend-pro" title="Pretend Pro is bought" subtitle="Shows the app as a Pro owner sees it" value={proState.pretend} onChange={(on) => pro.setPretend(on)} />
        <Divider />
        <View style={{ padding: space.m }}>
          <Button testID="sample-erase" kind="plain" label="Erase everything" onPress={erase} />
        </View>
      </Card>
      <Footnote>This screen is only in test builds and the web preview. It is not in the App Store version.</Footnote>
    </ScrollView>
  );
}
