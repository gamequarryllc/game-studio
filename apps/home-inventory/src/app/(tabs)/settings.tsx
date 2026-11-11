import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';

import { setCurrency } from '@/domain/actions';
import { FREE_ITEM_LIMIT } from '@/domain/limits';
import { CURRENCIES } from '@/domain/money';
import { plural } from '@/domain/selectors';
import { success, warning } from '@/platform/haptics';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { appVersion, eraseEverything, loadSample } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { choose, confirm, notify } from '@/ui/dialogs';
import { FormRow } from '@/ui/form';
import { Icon } from '@/ui/Icon';
import { Card, Divider, Footnote, Row, SectionLabel, TabScreen } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

export const PRIVACY_URL = 'https://gamequarryllc.github.io/game-studio/apps/privacy/';
export const SUPPORT_URL = 'https://gamequarryllc.github.io/game-studio/apps/support/#home-inventory';

export default function SettingsTab() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const proState = usePro();
  const [working, setWorking] = useState(false);
  const count = doc.items.length;
  const currency = CURRENCIES.find((k) => k.code === doc.settings.currency);

  const pickCurrency = async () => {
    const picked = await choose({ title: 'Currency for values', choices: CURRENCIES.map((k) => ({ key: k.code, label: `${k.name} (${k.code})` })) });
    if (picked) store.update((d) => setCurrency(d, picked));
  };

  const restorePurchase = async () => {
    if (!proState.storeOpen) {
      await notify('Purchases aren’t switched on in this build', 'There is nothing to restore here. In the App Store version this brings back Pro on a new iPhone.');
      return;
    }
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      await notify('Pro is back', 'Thank you. The item limit is gone.');
    } else if (result === 'nothing') {
      await notify('No purchase found', 'This Apple Account hasn’t bought Roomfile Pro.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  const sample = async (kind: 'home' | 'heavy') => {
    if (working) return;
    if (count > 0) {
      const sure = await confirm({ title: 'Replace your inventory with the sample?', message: `The ${plural(count, 'item')} here now will be deleted.`, confirmLabel: 'Replace', destructive: true });
      if (!sure) return;
    }
    setWorking(true);
    try {
      const loaded = await loadSample(kind);
      success();
      await notify('Sample home loaded', `${plural(loaded.items.length, 'item')} in ${plural(loaded.rooms.length, 'room')}.`);
    } finally {
      setWorking(false);
    }
  };

  const erase = async () => {
    const sure = await confirm({
      title: 'Erase everything?',
      message: 'Every room, item and photo on this iPhone will be deleted. A backup, if you made one, is not touched.',
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!sure) return;
    warning();
    await eraseEverything();
    router.replace('/welcome');
  };

  return (
    <TabScreen testID="settings-screen" title="Settings">
      <Card>
        <Row
          testID="pro-row"
          leading={
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: proState.isPro ? c.green : c.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="key" size={18} color={proState.isPro ? c.onGreen : c.green} />
            </View>
          }
          title="Roomfile Pro"
          subtitle={proState.isPro ? 'Unlocked. No item limit.' : `${Math.min(count, FREE_ITEM_LIMIT)} of ${FREE_ITEM_LIMIT} free items used`}
          chevron
          onPress={() => router.push('/pro')}
        />
        <Divider />
        <Row testID="restore-purchase" title="Restore purchase" tint onPress={restorePurchase} />
      </Card>

      <SectionLabel>Values</SectionLabel>
      <Card>
        <Row testID="currency" title="Currency" value={currency ? currency.code : doc.settings.currency} chevron onPress={pickCurrency} />
      </Card>
      <Footnote>Changing the currency changes the symbol, not the numbers.</Footnote>

      <SectionLabel>About</SectionLabel>
      <Card>
        <Row testID="privacy" title="Privacy policy" chevron onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <Divider />
        <Row testID="support" title="Help and support" chevron onPress={() => void Linking.openURL(SUPPORT_URL)} />
        <Divider />
        <Row title="Version" value={appVersion()} />
      </Card>
      <Footnote>Roomfile has no account and no servers. Your inventory never leaves this iPhone unless you export or back it up yourself.</Footnote>

      <SectionLabel>Your data</SectionLabel>
      <Card>
        <Row testID="erase-everything" title="Erase everything" destructive onPress={erase} />
      </Card>
      <Footnote>Deletes every room, item and photo from this iPhone. Make a backup first if you might want them again.</Footnote>

      {DEV_TOOLS ? (
        <>
          <SectionLabel>Developer</SectionLabel>
          <Card>
            <FormRow label="Pretend Pro is bought">
              <Switch
                testID="dev-pretend-pro"
                accessibilityLabel="Pretend Pro is bought"
                value={proState.pretend}
                onValueChange={(on) => pro.setPretend(on)}
                trackColor={{ true: c.green, false: c.sunk }}
                {...(Platform.OS === 'web' ? { activeThumbColor: '#fff' } : {})}
              />
            </FormRow>
            <Divider />
            <Row testID="dev-sample" title="Load the sample home" tint onPress={() => sample('home')} />
            <Divider />
            <Row testID="dev-heavy" title="Load a very large home" subtitle="About 650 items, to see how the app copes" tint onPress={() => sample('heavy')} />
          </Card>
          <Text style={[type.footnote, { color: c.ink2, marginHorizontal: space.xl + space.l, marginTop: space.s }]}>
            This section is only in test builds and the web preview. It is not in the App Store version.
          </Text>
        </>
      ) : null}
    </TabScreen>
  );
}
