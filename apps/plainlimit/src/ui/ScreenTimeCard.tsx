import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { clockLabel } from '@/domain/day';
import { settingsLockedNotice } from '@/domain/record';
import { tap } from '@/platform/haptics';
import { askToNotify } from '@/platform/notices';
import { DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, diagnostics, historyLog, isOn, permission, testCover, testUncover } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { BigButton, Card, IconTile, Label, tiles } from '@/ui/kit';
import { c } from '@/ui/theme';

const WOULD_NOT_START = 'The phone would not start counting. Check that Screen Time is on in the Settings app, then try again.';

/** Turning counting on: asks the phone, then for notices; `problem` says what went wrong, in words for the screen. */
function useTurnOn() {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await store.turnOnScreenTime();
      if (result === 'on') await askToNotify();
      if (result === 'denied') setProblem('Screen Time access was not given. Plainlimit cannot count your day without it.');
      if (result === 'failed') setProblem(WOULD_NOT_START);
    } catch {
      setProblem(WOULD_NOT_START);
    } finally {
      setBusy(false);
    }
  };
  return { turnOn, busy, problem };
}

/**
 * The top of Settings, on a real iPhone. While counting is on and all is well
 * it draws nothing: the switch that turns counting off lives in Advanced (the
 * owner, 2026-11-22: basics only on the front screens). It speaks up in two
 * cases: counting is off (a card to turn it on), and the battery is empty
 * (why the settings are locked).
 * Draws nothing in a browser or in Expo Go (but the preview's "?mock=" stand-in).
 */
export function ScreenTimeCard() {
  // Asks the phone whether counting is on as it draws: not to be kept by the React Compiler.
  'use no memo';
  const { settings } = useDoc();
  const { turnOn, busy, problem } = useTurnOn();
  // Left out of the App Store screenshots, as the phone in them is counting.
  if ((!SCREEN_TIME_AVAILABLE && !MOCK_PHONE) || STORE_SHOTS) return null;

  if (isOn()) {
    if (!settingsLocked()) return null;
    return (
      <Card style={{ paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={{ name: 'lock', bg: tiles.red }} />
        <Text style={[body, { flex: 1, color: c.ink }]}>{settingsLockedNotice(clockLabel(settings.rechargeMinute), store.passCheck())}</Text>
      </Card>
    );
  }

  const denied = permission() === 'denied';
  return (
    <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
      <Label>Screen Time</Label>
      <Text style={body}>
        {denied
          ? 'Screen Time access is off for Plainlimit. Turn it on to have the battery follow your real day.'
          : 'Let the battery follow your real screen time. The phone does the counting; Plainlimit hears how much time has gone, and none of it leaves your phone.'}
      </Text>
      <BigButton label={busy ? 'Asking…' : 'Turn on Screen Time'} onPress={() => void turnOn()} />
      {problem ? <Text style={[body, { color: c.ink }]}>{problem}</Text> : null}
    </Card>
  );
}

/**
 * Advanced, on a real iPhone: the switch that turns counting on and off.
 * Off is closed while the battery is empty, like the other settings (it would
 * be a way round the lock); a test build can always turn it off.
 */
export function ScreenTimeSwitch({ accent }: { accent: string }) {
  // Asks the phone whether counting is on as it draws: not to be kept by the React Compiler.
  'use no memo';
  useDoc();
  const { turnOn, busy, problem } = useTurnOn();
  if ((!SCREEN_TIME_AVAILABLE && !MOCK_PHONE) || STORE_SHOTS) return null;
  const on = isOn();
  const closed = on && settingsLocked() && !DEV_TOOLS;
  return (
    <Card style={{ paddingVertical: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={{ name: 'counting', bg: tiles.green }} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text nativeID="count-switch-label" style={{ fontSize: 16, fontWeight: '500', color: c.ink }}>
            Count my screen time
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 18, color: c.ink3 }}>{closed ? 'Opens again when the battery recharges' : 'Off: nothing counts or locks'}</Text>
        </View>
        <Switch
          accessibilityLabel="Count my screen time"
          aria-labelledby="count-switch-label"
          value={on}
          disabled={closed || busy}
          onValueChange={(next) => {
            tap();
            if (next) void turnOn();
            else store.turnOffScreenTime();
          }}
          trackColor={{ false: '#39393D', true: accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#39393D"
          // The web preview's own colour for the knob when on (the phone uses thumbColor).
          {...({ activeThumbColor: '#FFFFFF' } as object)}
        />
      </View>
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
