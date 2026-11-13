import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { clockLabel } from '@/domain/day';
import { askToNotify } from '@/platform/notices';
import { DEV_TOOLS, SCREEN_TIME_AVAILABLE, diagnostics, isOn, permission } from '@/platform/screenTime';
import { settingsLocked, store, useDoc, useNow } from '@/state/store';
import { BigButton, Card, Label } from '@/ui/kit';
import { c } from '@/ui/theme';

/**
 * Settings, on a real iPhone: turning real screen time on and off, and the
 * note that explains why the settings are locked while the battery is empty.
 * Draws nothing in a browser or in Expo Go.
 */
export function ScreenTimeCard() {
  const { settings } = useDoc();
  useNow();
  // The test build's readout is read again every few seconds and whenever this
  // screen comes back into view. (A tab that is out of view stops redrawing, so
  // without this a screenshot taken straight after switching tabs showed the
  // readout as it was when the tab was last looked at.)
  const [, readAgain] = useState(0);
  useFocusEffect(useCallback(() => readAgain((n) => n + 1), []));
  useEffect(() => {
    if (!DEV_TOOLS) return;
    const id = setInterval(() => readAgain((n) => n + 1), 3000);
    return () => clearInterval(id);
  }, []);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!SCREEN_TIME_AVAILABLE) return null;

  const on = isOn();
  const denied = permission() === 'denied';

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await store.turnOnScreenTime();
    if (result === 'on') await askToNotify();
    if (result === 'denied') setProblem('Screen Time access was not given. Plainlimit cannot count your day without it.');
    if (result === 'failed') setProblem('The phone would not start counting. Check that Screen Time is on in the Settings app, then try again.');
    setBusy(false);
  };

  if (on) {
    return (
      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>Screen Time</Label>
        <Text style={body}>On. The battery follows this phone&apos;s real screen time.</Text>
        {settingsLocked() ? (
          <Text style={[body, { color: c.ink }]}>The battery is empty, so these settings are locked until it recharges at {clockLabel(settings.rechargeMinute)}.</Text>
        ) : (
          <BigButton quiet label="Turn off" onPress={() => store.turnOffScreenTime()} />
        )}
        {DEV_TOOLS ? (
          <>
            <Text style={[body, { color: c.ink3, marginTop: 6 }]}>Test build only: these two are not in the App Store version.</Text>
            <BigButton quiet label="Start the day over" onPress={() => void store.startDayOver()} />
            {settingsLocked() ? <BigButton quiet label="Turn off" onPress={() => store.turnOffScreenTime()} /> : null}
            <Text selectable style={{ fontSize: 12, lineHeight: 17, color: c.ink3, marginTop: 4 }}>
              {diagnostics(settings).join('\n')}
            </Text>
          </>
        ) : null}
      </Card>
    );
  }

  return (
    <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
      <Label>Screen Time</Label>
      <Text style={body}>
        {denied
          ? 'Screen Time access is off for Plainlimit. Turn it on to have the battery follow your real day.'
          : 'Let the battery follow your real screen time. The phone does the counting; Plainlimit is only told when a cell is used up, never which apps you opened.'}
      </Text>
      <BigButton label={busy ? 'Asking…' : 'Turn on Screen Time'} onPress={() => void turnOn()} />
      {problem ? <Text style={[body, { color: c.ink }]}>{problem}</Text> : null}
    </Card>
  );
}

const body = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;
