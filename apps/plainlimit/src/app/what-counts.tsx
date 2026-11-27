import { Text } from 'react-native';

import { clockLabelOf, dayWord } from '@/domain/day';
import { batteryEnd } from '@/domain/recharge';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, isOn, permission } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { COUNTS_LEAD, EVERYTHING_COUNTS } from '@/ui/countWords';
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
// ticking an app would be a way round its lock. Choosing them for the first
// time is always open, and starts at once: until then every app counts,
// since setup no longer has to ask (state/setupKind.ts).
//
// And like a higher goal, a new essential waits for the next recharge
// (domain/essentials.ts): an app made an essential stops counting what it
// used today, so ticking one that had a lot of use would refill the battery.
// The screen shows the ones waiting in a card of their own, with the day
// they start. Taking one out is at once.

export default function WhatCounts() {
  // Asks the phone and the clock as it draws (is it locked, what waits, which day): never kept from an earlier drawing.
  'use no memo';
  const doc = useDoc();
  // Counting needs no essentials, but if it is off with access given (an older build's skipped setup), choosing them here starts it.
  const e = useEssentials(() => {
    if (SCREEN_TIME_AVAILABLE && doc.setupDone && permission() === 'approved' && !isOn()) void store.turnOnScreenTime();
  });
  // When the next battery starts: the recharge, or later with a new recharge time waiting (recharge.ts).
  const nextBattery = batteryEnd(doc.day, doc.settings);
  const when = { day: dayWord(nextBattery, new Date()), recharge: clockLabelOf(nextBattery) };
  const locked = settingsLocked() && e.ready;
  return (
    <Page header top={8}>
      <Title>Essentials</Title>
      {/* Once chosen, the two cards say it: "Never counted" and "Uses your battery". */}
      {e.ready ? null : <Lead>{COUNTS_LEAD}</Lead>}
      {SCREEN_TIME_AVAILABLE || MOCK_PHONE ? (
        <>
          {e.ready ? null : <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink }}>{EVERYTHING_COUNTS}</Text>}
          <EssentialsSteps e={e} locked={locked} when={when} />
        </>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>On an iPhone you tick them in Apple&apos;s own list of your apps. This preview runs on pretend use.</Text>
      )}
      {e.pickers}
    </Page>
  );
}
