import { Text } from 'react-native';

import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, COUNTED_ID, isOn, permission, pickCount } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { COUNTS_LEAD, COUNTS_NOTE, OLD_LIST_NOTE } from '@/ui/countWords';
import { EssentialsSteps, useEssentials } from '@/ui/EssentialsSteps';
import { Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';

// Essentials: the apps that never use up the battery and never lock. The
// person ticks only those; everything else counts, and is covered when the
// battery is empty. (Up to build 89 there was one list the other way round,
// "tick everything, then untick your essentials"; the file keeps its first
// name, "what counts".)
//
// Like the goal, the essentials can't change while the battery is empty:
// ticking an app would be a way round its lock. Choosing them for
// the first time is always open, since until then an older list may not be
// locking at all.

export default function WhatCounts() {
  const doc = useDoc();
  // Essentials chosen here after setup skipped them: counting starts now, as setup's last screen says it will.
  // (Up to build 152 it waited for "Turn on Screen Time" in Settings, which nothing pointed to.)
  const e = useEssentials(() => {
    if (SCREEN_TIME_AVAILABLE && doc.setupDone && permission() === 'approved' && !isOn()) void store.turnOnScreenTime();
  });
  const locked = settingsLocked() && e.ready;
  const oldList = !e.ready && pickCount(COUNTED_ID) > 0;
  return (
    <Page header top={8}>
      <Title>Essentials</Title>
      <Lead>{COUNTS_LEAD}</Lead>
      {SCREEN_TIME_AVAILABLE || MOCK_PHONE ? (
        <>
          {oldList ? <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink }}>{OLD_LIST_NOTE}</Text> : null}
          <EssentialsSteps e={e} locked={locked} />
          {locked ? <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink }}>This can&apos;t change while the battery is empty. It opens again when it recharges.</Text> : null}
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>{COUNTS_NOTE}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>On an iPhone you tick them in Apple&apos;s own list of your apps. This preview runs on pretend use.</Text>
      )}
      {e.pickers}
    </Page>
  );
}
