import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { refusalNeedsAlert, refusalWords } from '@/domain/access';
import { clockLabel } from '@/domain/day';
import { settingsLockedNotice } from '@/domain/record';
import { askToNotify } from '@/platform/notices';
import { DEV_TOOLS, ESSENTIALS_LIMIT, MOCK_PHONE, SCREEN_TIME_AVAILABLE, STORE_SHOTS, diagnostics, historyLog, isOn, permission, refusal, somethingCounts, testCover, testUncover } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { tooManyKept } from '@/ui/countWords';
import { useEssentials } from '@/ui/EssentialsSteps';
import { BigButton, Card, IconTile, Label, tiles } from '@/ui/kit';
import { c } from '@/ui/theme';

const WOULD_NOT_START = { title: 'Counting didn’t start', line: 'iOS would not start counting. Check that Screen Time is on in the Settings app, then try again.' };
/** Apple's first list (the device's apps) was closed with nothing ticked. */
const MISSED = { title: 'Nothing was ticked', line: 'Tap Turn on Screen Time again. In Apple’s list, tap All Apps & Categories at the top, then Done.' };

type Problem = { title: string; line: string };

/**
 * Turning counting on, all from the one button: asks iOS for access, then,
 * if the essentials were never chosen (setup's "Skip for now"), opens Apple's
 * lists for them and starts counting once they're saved; then asks for
 * notices. Whatever stops it is said on the card, and when iOS refused
 * without showing anything (no passcode, say) in a pop-up too, so a tap never
 * looks like it did nothing. (App Review, 1.1.0 on an iPad, 2026-11-26: "the
 * 'Turn on screen time' button was not functional".)
 */
function useTurnOn() {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  // Once the essentials are saved, carry on: this time there is something to count.
  const essentials = useEssentials(() => void turnOn());
  async function turnOn() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await store.turnOnScreenTime();
      if (result === 'on') await askToNotify();
      if (result === 'nothingPicked') essentials.start();
      if (result === 'denied') {
        const why = refusal() ?? 'declined';
        const words = refusalWords(why);
        setProblem(words);
        if (refusalNeedsAlert(why)) Alert.alert(words.title, words.line);
      }
      if (result === 'failed') setProblem(WOULD_NOT_START);
    } catch {
      setProblem(WOULD_NOT_START);
    } finally {
      setBusy(false);
    }
  }
  const shown = problem ?? (essentials.missed ? MISSED : essentials.refused > 0 ? { title: 'Too many essentials', line: tooManyKept(essentials.refused, ESSENTIALS_LIMIT) } : null);
  return { turnOn, busy: busy || essentials.busy, problem: shown, pickers: essentials.pickers };
}

/**
 * The top of Settings, on a real iPhone. While counting is on and all is well
 * it draws nothing. It speaks up in two cases: counting is off (a card to turn
 * it on), and the battery is empty (why the settings are locked).
 * Nothing in the app turns counting off: a "Turn off" button, then a switch in
 * Advanced, was an easy way round the day's limit, and the owner had it taken
 * out (2026-11-22). A test build keeps a button for it among its tools.
 * Draws nothing in a browser or in Expo Go (but the preview's "?mock=" stand-in).
 */
export function ScreenTimeCard() {
  // Asks the phone whether counting is on as it draws: not to be kept by the React Compiler.
  'use no memo';
  const { settings } = useDoc();
  const { turnOn, busy, problem, pickers } = useTurnOn();
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

  const access = permission();
  return (
    <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
      <Label>Screen Time</Label>
      <Text style={body}>
        {access === 'denied'
          ? 'Screen Time access is off for Plainlimit. Turn it on to have the battery follow your real day.'
          : access === 'approved' && !somethingCounts()
            ? 'One step left: pick your essentials in Apple’s list. Then the battery follows your real screen time.'
            : 'Let the battery follow your real screen time. The phone does the counting; Plainlimit only hears how much time has gone, never which apps you opened.'}
      </Text>
      {problem ? (
        <View accessibilityRole="alert" style={problemBox}>
          <Text style={problemTitle}>{problem.title}</Text>
          <Text style={[body, { color: c.ink }]}>{problem.line}</Text>
        </View>
      ) : null}
      <BigButton label={busy ? 'Asking…' : 'Turn on Screen Time'} onPress={() => void turnOn()} />
      {pickers}
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
      {/* The only way left to turn counting off, for trying the app's "off" side (the Turn on card, pretend use). */}
      <BigButton quiet label="Turn counting off (test)" onPress={() => store.turnOffScreenTime()} />
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
const problemBox = { borderWidth: 1.5, borderColor: '#F79200', borderRadius: 14, padding: 12, gap: 4 } as const;
const problemTitle = { fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#F7B24D' } as const;

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
