import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ASK_ID, IDLE_MINUTES, OPEN_CHOICES, askShownOn, askStateLine, openChange, openChoice, type OpenChoice } from '@/domain/askFirst';
import { askFirstFor } from '@/domain/pro';
import { tap } from '@/platform/haptics';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { usePro } from '@/pro/pro';
import { store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { BigButton, Card, Label, Lead, LinkRow, Page, Pills, Title } from '@/ui/kit';
import { SecondThoughtPicture } from '@/ui/SecondThoughtPicture';
import { FirstPickupApps } from '@/ui/UsageReport';
import { c } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Do more > Second thought (Ask first in the code): a second,
// optional list of apps that ask for one sum every time they open
// (src/domain/askFirst.ts).
//
// Reworked for 1.1 (the owner, 2026-11-21): the screen was mostly words, had
// no picture of how it works, and its Off/On cards stayed on Off after apps
// were picked. Now a picture shows how it works, a switch turns it on and
// off, picking apps turns it on by itself (switching off keeps them), and the
// open time is a row of pills. The phone lists the apps opened first after a
// pickup, as suggestions to pick (the owner, the same day).
//
// The owner, 2026-11-22, after trying it on the phone: the switch was in a bad
// spot (halfway down, in a row with the apps), and there was no way to stay in
// an app for longer than 15 minutes without it then being open all day. Of
// three places drawn for the switch they picked the top: it is now the first
// thing under the title, with On or Off in words, as in the phone's own
// Settings. The apps row sits under the suggestions, which are there to be
// picked. And the open time has a fourth choice, "Until I leave it".
//
// The owner, the same day, after build 138: the open time sat under the phone's
// list, a scroll away. Of three orders drawn they picked "Times second": the
// open time moves up to second, under the switch, and nothing else moves.
//
// The owner, after build 145: "Your apps" was hiding at the foot of the page,
// under the phone's list. It now sits in the first card, under the switch
// (with nothing picked, the "Choose apps" button does).
//
// Second thought is part of Pro (the owner, 2026-11-23; it was free while it
// was being tried). Without Pro the screen shows what it does, in its picture,
// and where to get it; nothing on it can be switched or picked.

const OPEN_PILLS: readonly { value: OpenChoice; label: string; spoken?: string; wide?: boolean }[] = [
  ...OPEN_CHOICES.map((minutes) => ({ value: minutes, label: `${minutes} min`, spoken: `${minutes} minutes` })),
  { value: 'use', label: 'Until I leave it', wide: true },
];

export default function AskFirstSettings() {
  const router = useRouter();
  const isPro = usePro().isPro;
  const [picking, setPicking] = useState(false);
  const doc = useDoc();
  const { accent, now } = useDay();
  const ask = askFirstFor(doc.settings, isPro);
  const phone = SCREEN_TIME_AVAILABLE || MOCK_PHONE;
  const picked = pickCount(ASK_ID);
  const on = askShownOn(ask, picked, phone);
  const open = openChoice(ask);
  const flip = (next: boolean) => {
    tap();
    // Nothing to ask first yet: switching on opens Apple's list, and picking turns it on.
    if (next && phone && picked === 0) setPicking(true);
    else store.setAskFirst({ on: next });
  };

  if (!isPro) {
    return (
      <Page header top={8}>
        <Title>Second thought</Title>
        <Lead>A pause before the apps you open without thinking.</Lead>
        <SecondThoughtPicture open={open} accent={accent} />
        <Text style={styles.hint}>Second thought is part of Plainlimit Pro.</Text>
        <BigButton label="See Plainlimit Pro" onPress={() => router.push('/pro')} />
      </Page>
    );
  }

  return (
    <Page header top={8}>
      <Title>Second thought</Title>
      <Lead>A pause before the apps you open without thinking.</Lead>

      <Card>
        <View style={styles.master}>
          <View style={{ flex: 1 }}>
            <Text testID="ask-state" style={[styles.state, on ? { color: accent } : null]}>
              {on ? 'On' : 'Off'}
            </Text>
            <Text style={styles.hint}>{askStateLine(on, picked, phone)}</Text>
          </View>
          <Switch
            accessibilityLabel="Second thought"
            value={on}
            onValueChange={flip}
            trackColor={{ false: '#39393D', true: accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#39393D"
            // On an iPhone the switch puts itself at the top of its row unless told otherwise.
            style={{ alignSelf: 'center' }}
            // The web preview's own colour for the knob when on (the phone uses thumbColor).
            {...({ activeThumbColor: '#FFFFFF' } as object)}
          />
        </View>
        {/* The apps sit with the switch: at the foot of the page they were out of sight (the owner, 2026-11-22). */}
        {!phone ? null : picked === 0 ? (
          <View style={{ paddingTop: 2, paddingBottom: 16 }}>
            <BigButton label="Choose apps" onPress={() => setPicking(true)} />
          </View>
        ) : (
          <View style={styles.apps}>
            <LinkRow label="Your apps" value={`${picked} picked`} onPress={() => setPicking(true)} last />
          </View>
        )}
      </Card>

      {/* The open time comes second, so it shows as the screen opens (the owner, 2026-11-22). */}
      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
        <Label>After the sum, open</Label>
        <Pills options={OPEN_PILLS} chosen={open} accent={accent} onChange={(choice) => store.setAskFirst(openChange(choice))} />
        {open === 'use' ? <Text style={styles.hint}>{`Stays open until you leave the app. Asks again about ${IDLE_MINUTES} minutes after you leave.`}</Text> : null}
      </Card>

      <SecondThoughtPicture open={open} accent={accent} />

      {phone ? (
        <Card style={{ paddingTop: 14, paddingBottom: 12 }}>
          {/* Suggestions: what the phone says is opened first after a pickup (drawn by the phone; the app can't read or tick them). */}
          <Label>You open these first</Label>
          <Text style={[styles.hint, { marginTop: 2, marginBottom: 2 }]}>After picking up your phone, last 7 days.</Text>
          <FirstPickupApps now={now} />
        </Card>
      ) : (
        <Card>
          <Text style={[styles.hint, { paddingVertical: 14 }]}>On an iPhone you pick the apps in Apple’s own list.</Text>
        </Card>
      )}

      <Text style={styles.foot}>Apps that also count still use your battery, and stay locked when it’s empty.</Text>

      <AppPicker
        id={ASK_ID}
        open={picking}
        header="Tick the apps you open without thinking"
        onClose={() => {
          setPicking(false);
          store.askPicksChanged(pickCount(ASK_ID));
        }}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  apps: { borderTopWidth: 1, borderTopColor: c.rule },
  master: { minHeight: 66, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  state: { fontSize: 18, lineHeight: 22, fontWeight: '600', color: c.ink },
  hint: { fontSize: 15, lineHeight: 20, color: c.ink3 },
  foot: { fontSize: 14, lineHeight: 20, color: c.ink3, paddingHorizontal: 2 },
});
