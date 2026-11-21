import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ASK_ID, DEFAULT_ASK_FIRST, OPEN_CHOICES, askShownOn } from '@/domain/askFirst';
import { tap } from '@/platform/haptics';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { BigButton, Card, Label, Lead, LinkRow, Page, Pills, Title } from '@/ui/kit';
import { SecondThoughtPicture } from '@/ui/SecondThoughtPicture';
import { c } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Advanced > Second thought (Ask first in the code): a second,
// optional list of apps that ask for one sum every time they open
// (src/domain/askFirst.ts).
//
// Reworked for 1.1 (the owner, 2026-11-21): the screen was mostly words, had
// no picture of how it works, and its Off/On cards stayed on Off after apps
// were picked. Now a picture shows how it works, a switch turns it on and
// off, picking apps turns it on by itself (switching off keeps them), and the
// open time is three pills.

const OPEN_PILLS = OPEN_CHOICES.map((minutes) => ({ value: minutes, label: `${minutes} min`, spoken: `${minutes} minutes` }));

export default function AskFirstSettings() {
  const [picking, setPicking] = useState(false);
  const doc = useDoc();
  const { accent } = useDay();
  const ask = doc.settings.askFirst ?? DEFAULT_ASK_FIRST;
  const phone = SCREEN_TIME_AVAILABLE || MOCK_PHONE;
  const picked = pickCount(ASK_ID);
  const on = askShownOn(ask, picked, phone);
  const flip = (next: boolean) => {
    tap();
    // Nothing to ask first yet: switching on opens Apple's list, and picking turns it on.
    if (next && phone && picked === 0) setPicking(true);
    else store.setAskFirst({ on: next });
  };

  return (
    <Page top={8}>
      <Title>Second thought</Title>
      <Lead>A pause before the apps you open without thinking.</Lead>

      <SecondThoughtPicture openMinutes={ask.openMinutes} accent={accent} />

      <Card style={phone && picked === 0 ? { paddingBottom: 16 } : undefined}>
        <View style={[styles.row, phone && picked > 0 ? styles.rowRule : null]}>
          <Text nativeID="ask-switch-label" style={styles.rowLabel}>
            Second thought
          </Text>
          <Switch
            accessibilityLabel="Second thought"
            aria-labelledby="ask-switch-label"
            value={on}
            onValueChange={flip}
            trackColor={{ false: '#39393D', true: accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#39393D"
            // The web preview's own colour for the knob when on (the phone uses thumbColor).
            {...({ activeThumbColor: '#FFFFFF' } as object)}
          />
        </View>
        {phone ? (
          picked === 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.hint}>Pick apps and it turns on.</Text>
              <BigButton label="Choose apps" onPress={() => setPicking(true)} />
            </View>
          ) : (
            <LinkRow label="Apps" value={`${picked} picked`} onPress={() => setPicking(true)} last />
          )
        ) : (
          <Text style={[styles.hint, { paddingBottom: 14 }]}>On an iPhone you pick the apps in Apple’s own list.</Text>
        )}
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
        <Label>After the sum, open for</Label>
        <Pills options={OPEN_PILLS} chosen={ask.openMinutes} accent={accent} onChange={(minutes) => store.setAskFirst({ openMinutes: minutes })} />
      </Card>

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
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 17, fontWeight: '600', color: c.ink },
  hint: { fontSize: 15, lineHeight: 20, color: c.ink3 },
  foot: { fontSize: 14, lineHeight: 20, color: c.ink3, paddingHorizontal: 2 },
});
