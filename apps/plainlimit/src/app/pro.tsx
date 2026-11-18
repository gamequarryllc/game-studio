import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PRO_FEATURES } from '@/domain/pro';
import { success } from '@/platform/haptics';
import { EXPECTED_PRICE } from '@/pro/config';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { BigButton, Card, Lead, Page, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';

// Plainlimit Pro: what it adds, one payment, and Restore. The answer to a
// purchase is said on the screen itself, under the buttons, never in a pop-up.

const NO_STORE = DEV_TOOLS
  ? 'Nothing can be bought in this build. To try Pro, turn on “Pretend Pro is bought” in Settings, under Developer.'
  : 'Nothing can be bought in this build.';

export default function ProScreen() {
  const router = useRouter();
  const state = usePro();
  const [said, setSaid] = useState<string | null>(null);
  // The price comes from the App Store. If the phone was offline when the app started, ask again now.
  useEffect(() => {
    void pro.refreshPrice();
  }, []);
  // Where there is a store, only its own price is shown: the draft price would be wrong in another country.
  const price = state.price ?? (state.storeOpen ? null : EXPECTED_PRICE);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const buy = async () => {
    if (!state.storeOpen) return setSaid(NO_STORE);
    setSaid(null);
    const result = await pro.buy();
    if (result === 'purchased') {
      success();
      setSaid('Pro is unlocked. Thank you.');
    } else if (result === 'pending') setSaid('Waiting for approval. Pro unlocks on this iPhone as soon as the purchase is approved.');
    else if (result === 'unavailable') setSaid('The App Store couldn’t be reached. Check your connection and try again.');
    else if (result === 'failed') setSaid('The purchase didn’t go through, and you haven’t been charged. Try again in a moment.');
  };

  const restore = async () => {
    if (!state.storeOpen) return setSaid('There is nothing to restore in this build. In the App Store version this brings Pro back on a new iPhone.');
    setSaid(null);
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      setSaid('Pro is back on this iPhone.');
    } else if (result === 'nothing') setSaid('This Apple Account hasn’t bought Plainlimit Pro.');
    else setSaid('The App Store couldn’t be reached. Check your connection and try again.');
  };

  return (
    <Page top={8}>
      <View testID="pro-screen" style={{ gap: 10 }}>
        <Title>{state.isPro ? 'Pro is unlocked' : 'Plainlimit Pro'}</Title>
        <Lead>
          {state.isPro
            ? 'Everything below is yours, on this iPhone and any other with your Apple Account.'
            : 'The battery, your essentials, sums, the recharge and emergency passes are free for good. Pro adds a few extras.'}
        </Lead>
      </View>

      <Card style={{ paddingTop: 6, paddingBottom: 6 }}>
        {PRO_FEATURES.map((f, i) => (
          <View key={f.title} style={[styles.feature, i < PRO_FEATURES.length - 1 ? styles.rule : null]}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureLine}>{f.line}</Text>
          </View>
        ))}
      </Card>

      {state.isPro ? (
        <BigButton label="Done" onPress={leave} />
      ) : (
        <View style={{ gap: 10 }}>
          <BigButton label={state.busy ? 'One moment…' : price ? `Unlock Pro · ${price}` : 'Unlock Pro'} disabled={state.busy} onPress={() => void buy()} />
          <BigButton quiet label="Restore purchase" disabled={state.busy} onPress={() => void restore()} />
          <Text style={styles.small}>One payment through the App Store. No subscription.</Text>
        </View>
      )}
      {said ? (
        <Text testID="pro-said" accessibilityLiveRegion="polite" style={styles.said}>
          {said}
        </Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  feature: { paddingVertical: 14, gap: 3 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  featureTitle: { fontFamily: display.semi, fontSize: 18, lineHeight: 22, color: c.ink },
  featureLine: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  small: { fontSize: 14, lineHeight: 20, color: c.ink3, textAlign: 'center' },
  said: { fontSize: 15, lineHeight: 21, color: c.ink2 },
});
