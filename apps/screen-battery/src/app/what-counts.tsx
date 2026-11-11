import { Text, View } from 'react-native';

import { store, useDoc } from '@/state/store';
import { Choice, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';

export default function WhatCounts() {
  const { settings } = useDoc();
  return (
    <Page top={8}>
      <Title>What counts</Title>
      <Lead>Choose which apps drain your battery.</Lead>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        <Choice
          title="Everything"
          line="Every app drains it, always-allowed apps included."
          chosen={settings.countMode === 'everything'}
          onPress={() => store.setCountMode('everything')}
        />
        <Choice
          title="Time-wasters"
          line="Social, Games and Entertainment. Work apps don't drain it."
          chosen={settings.countMode === 'timeWasters'}
          onPress={() => store.setCountMode('timeWasters')}
        />
        <Choice title="Your own picks" line="Tick the apps and categories yourself. Not built yet." chosen={settings.countMode === 'custom'} onPress={() => {}} tag="Pro" disabled />
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3, marginTop: 8 }}>On an iPhone, your own picks are made in Apple&apos;s own list of your apps.</Text>
    </Page>
  );
}
