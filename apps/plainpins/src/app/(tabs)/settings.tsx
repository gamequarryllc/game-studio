import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setMapStyle } from '@/domain/actions';
import { FREE_PLACE_LIMIT } from '@/domain/limits';
import { success, warning } from '@/platform/haptics';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { appVersion, applyRestore, backUp, chooseBackup, eraseEverything, restoreProblemText } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { confirm, notify } from '@/ui/dialogs';
import { Icon } from '@/ui/Icon';
import { Card, Chip, Divider, Footnote, MarginLabel, Row, SwitchRow } from '@/ui/kit';
import { TAB_BAR_SPACE, space, type, useTheme } from '@/ui/theme';

const PRIVACY_URL = 'https://gamequarryllc.github.io/game-studio/apps/privacy/';
const SUPPORT_URL = 'https://gamequarryllc.github.io/game-studio/apps/support/#plainpins';

export default function SettingsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDoc();
  const proState = usePro();
  const [working, setWorking] = useState(false);
  const count = doc.places.length;
  const satellite = proState.isPro && doc.settings.mapStyle === 'satellite';

  const run = async (work: () => Promise<void>, failed: string) => {
    if (working) return;
    setWorking(true);
    try {
      await work();
    } catch {
      await notify(failed, 'Try again in a moment.');
    } finally {
      setWorking(false);
    }
  };

  const restorePurchase = async () => {
    if (!proState.storeOpen) {
      await notify('Purchases aren’t switched on in this build', 'There is nothing to restore here. In the App Store version this brings back Pro on a new iPhone.');
      return;
    }
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      await notify('Pro is back', 'Thank you. Pin as many places as you like.');
    } else if (result === 'nothing') {
      await notify('No purchase found', 'This Apple Account hasn’t bought Pro for this app.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  const restore = () =>
    run(async () => {
      const result = await chooseBackup();
      if (!result.ok) {
        if (!result.cancelled) {
          const text = restoreProblemText(result.problem);
          await notify(text.title, text.message);
        }
        return;
      }
      const n = result.doc.places.length;
      const sure = await confirm({
        title: 'Replace what is on this iPhone?',
        message: `The backup has ${n} ${n === 1 ? 'place' : 'places'}. Everything here now is replaced by it.`,
        confirmLabel: 'Replace',
        destructive: count > 0,
      });
      if (!sure) return;
      await applyRestore(result.doc, result.photos);
      success();
      await notify('Backup restored', `${n} ${n === 1 ? 'place is' : 'places are'} back on the map.`);
    }, 'The backup couldn’t be restored');

  const erase = async () => {
    const sure = await confirm({
      title: 'Erase everything?',
      message: 'Every pin, story and photo in this app will be deleted. A backup, if you made one, is not touched, and neither is your photo library.',
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!sure) return;
    warning();
    await eraseEverything();
    await notify('Everything is erased', 'The map is empty again.');
  };

  const pickStyle = (style: 'standard' | 'satellite') => {
    if (style === 'satellite' && !proState.isPro) {
      router.push({ pathname: '/pro', params: { why: 'satellite' } });
      return;
    }
    store.update((d, now) => setMapStyle(d, style, now));
  };

  return (
    <ScrollView testID="settings-screen" style={{ flex: 1, backgroundColor: c.page }} contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 22 : 10), paddingBottom: TAB_BAR_SPACE + space.xl }}>
      <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink, paddingHorizontal: space.xl, marginBottom: space.l }]}>
        Settings
      </Text>

      <Card>
        <Row
          testID="pro-row"
          icon="key"
          title="Pro"
          subtitle={proState.isPro ? 'Unlocked. Pin as many places as you like.' : count > FREE_PLACE_LIMIT ? `${count} places. Free holds ${FREE_PLACE_LIMIT}; all of them stay on the map.` : `${count} of ${FREE_PLACE_LIMIT} free places used`}
          chevron
          onPress={() => router.push('/pro')}
        />
        <Divider />
        <Row testID="restore-purchase" title="Restore purchase" onPress={restorePurchase} />
      </Card>

      <MarginLabel>The map</MarginLabel>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: space.l }}>
        <Chip testID="style-standard" label="Street map" selected={!satellite} onPress={() => pickStyle('standard')} />
        <Chip testID="style-satellite" label="Satellite" selected={satellite} leading={proState.isPro ? undefined : <Icon name="lock" size={12} color={c.ink3} />} onPress={() => pickStyle('satellite')} />
      </View>
      <Footnote>{proState.isPro ? 'Either way it is a globe when you zoom all the way out.' : 'The satellite globe comes with Pro. The street map is a globe too when you zoom all the way out.'}</Footnote>

      <MarginLabel>Your data</MarginLabel>
      <Card>
        <Row testID="backup" icon="backup" title="Back up" subtitle="One file with every place and photo, saved wherever you choose" onPress={() => run(backUp, 'The backup couldn’t be made')} />
        <Divider inset={52} />
        <Row testID="restore" icon="restore" title="Restore from a backup" onPress={restore} />
        <Divider inset={52} />
        <Row testID="erase-everything" icon="trash" title="Erase everything" destructive onPress={erase} />
      </Card>
      <Footnote>There is no account and no server. Your places and photos stay on this iPhone unless you back them up yourself.</Footnote>

      <MarginLabel>About</MarginLabel>
      <Card>
        <Row testID="privacy" icon="hand" title="Privacy policy" chevron onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <Divider inset={52} />
        <Row testID="support" icon="help" title="Help and support" chevron onPress={() => void Linking.openURL(SUPPORT_URL)} />
        <Divider inset={52} />
        <Row icon="info" title="Version" value={appVersion()} />
      </Card>

      {DEV_TOOLS ? (
        <>
          <MarginLabel>Developer</MarginLabel>
          <Card>
            <SwitchRow testID="dev-pretend-pro" title="Pretend Pro is bought" value={proState.pretend} onChange={(on) => pro.setPretend(on)} />
            <Divider />
            <Row testID="dev-sample" icon="flask" title="Sample map" subtitle="Fill the map with made-up visits to real places" chevron onPress={() => router.push('/sample')} />
          </Card>
          <Footnote>This section is only in test builds and the web preview. It is not in the App Store version.</Footnote>
        </>
      ) : null}
    </ScrollView>
  );
}
