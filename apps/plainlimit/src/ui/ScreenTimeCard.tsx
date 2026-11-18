import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { clockLabel } from '@/domain/day';
import { settingsLockedNotice } from '@/domain/record';
import { askToNotify } from '@/platform/notices';
import { DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, diagnostics, historyLog, isOn, permission, testCover, testUncover } from '@/platform/screenTime';
import { settingsLocked, store, useDoc, useNow } from '@/state/store';
import { BigButton, Card, Label } from '@/ui/kit';
import { c } from '@/ui/theme';

/**
 * Settings, on a real iPhone: turning real screen time on and off, and the
 * note that explains why the settings are locked while the battery is empty.
 * Draws nothing in a browser or in Expo Go (but the preview's "?mock=" stand-in).
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
  // Left out of the App Store screenshots, so the goal and the empty-battery choices fit on one screen.
  if ((!SCREEN_TIME_AVAILABLE && !MOCK_PHONE) || STORE_SHOTS) return null;

  const on = isOn();
  const denied = permission() === 'denied';

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await store.turnOnScreenTime();
      if (result === 'on') await askToNotify();
      if (result === 'denied') setProblem('Screen Time access was not given. Plainlimit cannot count your day without it.');
      if (result === 'failed') setProblem('The phone would not start counting. Check that Screen Time is on in the Settings app, then try again.');
    } catch {
      setProblem('The phone would not start counting. Check that Screen Time is on in the Settings app, then try again.');
    } finally {
      setBusy(false);
    }
  };

  if (on) {
    return (
      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>Screen Time</Label>
        <Text style={body}>On. The battery follows this phone&apos;s real screen time.</Text>
        {settingsLocked() ? (
          <Text style={[body, { color: c.ink }]}>{settingsLockedNotice(clockLabel(settings.rechargeMinute), store.passCheck())}</Text>
        ) : (
          <BigButton quiet label="Turn off" onPress={() => store.turnOffScreenTime()} />
        )}
        {DEV_TOOLS ? (
          <>
            <Text style={[body, { color: c.ink3, marginTop: 6 }]}>Test build only: nothing below this line is in the App Store version.</Text>
            <BigButton quiet label="Start the day over" onPress={() => void store.startDayOver()} />
            <BigButton
              quiet
              label="Lock now (test)"
              onPress={() => {
                testCover(settings, store.get().doc.day.topUps);
                readAgain((n) => n + 1);
              }}
            />
            <BigButton
              quiet
              label="Unlock (test)"
              onPress={() => {
                testUncover();
                readAgain((n) => n + 1);
              }}
            />
            {settingsLocked() ? <BigButton quiet label="Turn off" onPress={() => store.turnOffScreenTime()} /> : null}
            <Text selectable style={{ fontSize: 12, lineHeight: 17, color: c.ink3, marginTop: 4 }}>
              {[...diagnostics(settings), historyLine(store.get().doc.history), ...historyLog().map((l) => `History: ${l}`)].join('\n')}
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
          : 'Let the battery follow your real screen time. The phone does the counting; Plainlimit only hears how much time has gone, never which apps you opened.'}
      </Text>
      <BigButton label={busy ? 'Asking…' : 'Turn on Screen Time'} onPress={() => void turnOn()} />
      {problem ? <Text style={[body, { color: c.ink }]}>{problem}</Text> : null}
    </Card>
  );
}

const body = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;

/** For the readout: how many finished days are kept, and the latest, so a lost day shows. */
function historyLine(history: readonly { start: string; usedMinutes: number; state: string }[]): string {
  if (history.length === 0) return 'Days kept: none';
  const last = history[history.length - 1];
  const day = new Date(last.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `Days kept: ${history.length}, latest ${day} (${last.usedMinutes} min, ${last.state})`;
}
