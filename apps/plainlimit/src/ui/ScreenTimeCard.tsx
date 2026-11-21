import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { clockLabel } from '@/domain/day';
import { settingsLockedNotice } from '@/domain/record';
import { askToNotify } from '@/platform/notices';
import { DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, diagnostics, historyLog, isOn, permission, testCover, testUncover } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { BigButton, Card, Label } from '@/ui/kit';
import { c } from '@/ui/theme';

/**
 * Settings, on a real iPhone: turning real screen time on and off, and the
 * note that explains why the settings are locked while the battery is empty.
 * Draws nothing in a browser or in Expo Go (but the preview's "?mock=" stand-in).
 */
export function ScreenTimeCard() {
  const { settings } = useDoc();
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
        {/* A test build can turn counting off even while the settings are locked. */}
        {DEV_TOOLS && settingsLocked() ? <BigButton quiet label="Turn off" onPress={() => store.turnOffScreenTime()} /> : null}
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

/**
 * Test builds only, at the bottom of Settings: tools for trying the locks, and
 * a readout of what the phone holds. It sits below everything else so that a
 * readout growing or shrinking never moves the settings above it (build 127:
 * the goal's stepper jumped about under the finger). The readout is read every
 * few seconds while Settings is in view, not on every change: reading it asks
 * the phone for a lot.
 */
export function TestBuildTools() {
  // Asks the phone whether counting is on as it draws: not to be kept by the React Compiler.
  'use no memo';
  const [readout, setReadout] = useState('');
  const readAgain = useCallback(() => {
    if (DEV_TOOLS && isOn()) setReadout(readoutNow());
  }, []);
  // Read on coming into view (a screenshot straight after switching tabs once
  // showed an old readout), then every few seconds while Settings is in view.
  useFocusEffect(
    useCallback(() => {
      readAgain();
      if (!DEV_TOOLS) return undefined;
      const id = setInterval(readAgain, 3000);
      return () => clearInterval(id);
    }, [readAgain]),
  );
  if (!DEV_TOOLS || (!SCREEN_TIME_AVAILABLE && !MOCK_PHONE) || STORE_SHOTS || !isOn()) return null;
  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      <Label>Developer: Screen Time</Label>
      <Text style={[body, { color: c.ink3 }]}>Test build only: none of this is in the App Store version.</Text>
      <BigButton quiet label="Start the day over" onPress={() => void store.startDayOver()} />
      <BigButton
        quiet
        label="Lock now (test)"
        onPress={() => {
          const { settings, day } = store.get().doc;
          testCover(settings, day.topUps);
          readAgain();
        }}
      />
      <BigButton
        quiet
        label="Unlock (test)"
        onPress={() => {
          testUncover(store.get().doc.settings);
          readAgain();
        }}
      />
      <Text selectable style={{ fontSize: 12, lineHeight: 17, color: c.ink3, marginTop: 4 }}>
        {readout}
      </Text>
    </View>
  );
}

const body = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;

/** The test build's readout, as the phone has it now. */
function readoutNow(): string {
  const doc = store.get().doc;
  return [...diagnostics(doc.settings), historyLine(doc.history), ...historyLog().map((l) => `History: ${l}`)].join('\n');
}

/** For the readout: how many finished days are kept, and the latest, so a lost day shows. */
function historyLine(history: readonly { start: string; usedMinutes: number; state: string }[]): string {
  if (history.length === 0) return 'Days kept: none';
  const last = history[history.length - 1];
  const day = new Date(last.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `Days kept: ${history.length}, latest ${day} (${last.usedMinutes} min, ${last.state})`;
}
