import { useState } from 'react';
import { Text } from 'react-native';

import { ASK_ID, DEFAULT_ASK_FIRST, OPEN_CHOICES } from '@/domain/askFirst';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { BigButton, Card, Choice, Label, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Second thought (Ask first in the code): a second, optional list of apps that ask for one sum
// every time they open (src/domain/askFirst.ts).

export default function AskFirstSettings() {
  const [picking, setPicking] = useState(false);
  const [, redraw] = useState(0);
  const doc = useDoc();
  const { accent } = useDay();
  const ask = doc.settings.askFirst ?? DEFAULT_ASK_FIRST;
  const picked = pickCount(ASK_ID);
  const phone = SCREEN_TIME_AVAILABLE || MOCK_PHONE;
  return (
    <Page top={8}>
      <Title>Second thought</Title>
      <Lead>For the apps you open without deciding to. Each one asks for one sum before it opens, whatever the battery says.</Lead>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Choice title="Off" line="Apps open as usual" chosen={!ask.on} accent={accent} onPress={() => store.setAskFirst({ on: false })} />
        <Choice title="On" line="The apps below ask for one sum first" chosen={ask.on} accent={accent} onPress={() => store.setAskFirst({ on: true })} />
      </Card>

      {phone ? (
        <>
          <Text style={{ fontSize: 15, lineHeight: 21, color: picked === 0 ? c.ink : c.ink2, marginTop: 4 }}>
            {picked === 0 ? 'No apps picked yet.' : `${picked} picked in Apple’s list.`}
          </Text>
          <BigButton label={picked === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(true)} />
        </>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>On an iPhone you pick them in Apple’s own list of your apps.</Text>
      )}

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8, marginTop: 8 }}>
        <Label>After the sum, open for</Label>
        {OPEN_CHOICES.map((minutes) => (
          <Choice key={minutes} title={`${minutes} minutes`} chosen={ask.openMinutes === minutes} accent={accent} onPress={() => store.setAskFirst({ openMinutes: minutes })} />
        ))}
      </Card>

      <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>
        iOS doesn’t tell Plainlimit when you leave an app, so after the sum the apps stay open for the time above, then ask again. An app that also counts still uses up the battery, and stays locked while the battery is empty.
      </Text>

      <AppPicker
        id={ASK_ID}
        open={picking}
        header="Tick the apps you open without thinking"
        onClose={() => {
          setPicking(false);
          store.askPicksChanged();
          redraw((n) => n + 1);
        }}
      />
    </Page>
  );
}
