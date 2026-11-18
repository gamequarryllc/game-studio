import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { sumLevelFor } from '@/domain/pro';
import type { SumLevel } from '@/domain/puzzle';
import { usePro } from '@/pro/pro';
import { settingsLocked, store } from '@/state/store';
import { Card, Choice, Label, LinkRow, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Advanced: the extras, kept off the main screens so the app stays
// simple (the owner, 2026-11-17). Easy and hard sums are Pro.

export default function Advanced() {
  const router = useRouter();
  const { settings, accent } = useDay();
  const isPro = usePro().isPro;
  const locked = settingsLocked();
  const ask = settings.askFirst;
  const askValue = ask?.on ? `On, ${ask.openMinutes} min` : 'Off';
  const level = sumLevelFor(settings, isPro);
  // Easy and hard sums are Pro: without it, choosing one shows what Pro adds.
  const choose = (next: SumLevel) => (next === 'normal' || isPro ? store.setSumLevel(next) : router.push('/pro'));

  return (
    <Page top={8}>
      <Title>Advanced</Title>
      <Lead>Extras for when the basics aren’t quite enough.</Lead>

      <Card>
        <LinkRow label="Second thought" value={askValue} onPress={() => router.push('/ask-first')} />
        <LinkRow label="Lock message" value={settings.lockMessage ? 'On' : 'Off'} onPress={() => router.push('/lock-message')} last />
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>Sums</Label>
        <Choice title="Easy" line="Like 47 + 8" chosen={level === 'easy'} disabled={locked} accent={accent} tag={isPro ? undefined : 'Pro'} onPress={() => choose('easy')} />
        <Choice title="Normal" line="Like 47 + 38" chosen={level === 'normal'} disabled={locked} accent={accent} onPress={() => choose('normal')} />
        <Choice title="Hard" line="Like 347 + 86" chosen={level === 'hard'} disabled={locked} accent={accent} tag={isPro ? undefined : 'Pro'} onPress={() => choose('hard')} />
      </Card>
      <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>For earning time when the battery is empty, and for Second thought.</Text>
    </Page>
  );
}
