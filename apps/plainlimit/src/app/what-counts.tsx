import { useState } from 'react';
import { Text, View } from 'react-native';

import { COUNTED_ID, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { store } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { BigButton, Choice, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

export default function WhatCounts() {
  const { settings, accent } = useDay();
  const [picking, setPicking] = useState(false);
  const picked = pickCount(COUNTED_ID);
  // On a real iPhone, "Time-wasters" is whatever is ticked in Apple's list.
  const choosing = SCREEN_TIME_AVAILABLE && settings.countMode !== 'everything';
  return (
    <Page top={8}>
      <Title>What counts</Title>
      <Lead>Choose which apps drain your battery.</Lead>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        <Choice
          title="Everything"
          line="Every app drains it, always-allowed apps included."
          chosen={settings.countMode === 'everything'}
          accent={accent}
          onPress={() => store.setCountMode('everything')}
        />
        <Choice
          title="Time-wasters"
          line={SCREEN_TIME_AVAILABLE ? "Only the apps you tick. Work apps don't drain it." : "Social, Games and Entertainment. Work apps don't drain it."}
          chosen={settings.countMode === 'timeWasters'}
          accent={accent}
          onPress={() => store.setCountMode('timeWasters')}
        />
        <Choice title="Your own picks" line="Tick the apps and categories yourself. Not built yet." chosen={settings.countMode === 'custom'} onPress={() => {}} tag="Pro" disabled />
      </View>
      {choosing ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={{ fontSize: 15, lineHeight: 21, color: picked === 0 ? c.ink : c.ink2 }}>
            {picked === 0 ? 'Nothing is ticked yet, so nothing drains the battery.' : picked === 1 ? '1 app or category is ticked.' : `${picked} apps and categories are ticked.`}
          </Text>
          <BigButton label={picked === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(true)} />
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>For the usual time-wasters, tick Social, Games and Entertainment.</Text>
        </View>
      ) : SCREEN_TIME_AVAILABLE ? null : (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3, marginTop: 8 }}>On an iPhone, your own picks are made in Apple&apos;s own list of your apps.</Text>
      )}
      <AppPicker
        id={COUNTED_ID}
        open={picking}
        header="Tick what drains your battery"
        onClose={() => {
          setPicking(false);
          store.picksChanged();
        }}
      />
    </Page>
  );
}
