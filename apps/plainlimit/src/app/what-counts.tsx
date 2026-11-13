import { useState } from 'react';
import { Text, View } from 'react-native';

import { COUNTED_ID, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { COUNTS_LEAD, COUNTS_NOTE, COUNTS_STEPS, pickedWords } from '@/ui/countWords';
import { BigButton, Card, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';

// One list. What is ticked in Apple's list of apps uses up the battery and is
// covered when it is empty; what is not ticked does neither. (There used to be
// an "Everything" choice and a separate always-allowed list, which left apps
// that were allowed but still counted. They are gone.)
//
// Like the goal, the list can't change while the battery is empty: unticking
// an app would be a way round its lock.

export default function WhatCounts() {
  const [picking, setPicking] = useState(false);
  const [, redraw] = useState(0);
  const picked = pickCount(COUNTED_ID);
  useDoc();
  const locked = settingsLocked();
  return (
    <Page top={8}>
      <Title>What counts</Title>
      <Lead>{COUNTS_LEAD}</Lead>
      {SCREEN_TIME_AVAILABLE ? (
        <>
          <Card style={{ paddingVertical: 14, gap: 8 }}>
            {COUNTS_STEPS.map((line, i) => (
              <View key={line} style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '700', color: c.ink3, width: 12 }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: c.ink }}>{line}</Text>
              </View>
            ))}
          </Card>
          <Text style={{ fontSize: 15, lineHeight: 21, color: picked === 0 ? c.ink : c.ink2, marginTop: 4 }}>{pickedWords(picked)}</Text>
          {locked ? (
            <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink }}>This can&apos;t change while the battery is empty. It opens again when it recharges.</Text>
          ) : (
            <BigButton label={picked === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(true)} />
          )}
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>{COUNTS_NOTE}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>On an iPhone you tick them in Apple&apos;s own list of your apps. This preview runs on pretend use.</Text>
      )}
      <AppPicker
        id={COUNTED_ID}
        open={picking}
        header="Tick what uses up your battery"
        onClose={() => {
          setPicking(false);
          store.picksChanged();
          redraw((n) => n + 1);
        }}
      />
    </Page>
  );
}
