import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cellWords } from '@/domain/battery';
import { clockLabel, durationLabel } from '@/domain/day';
import { askToNotify } from '@/platform/notices';
import { tickStepMinutes } from '@/domain/checkpoints';
import { COUNTED_ID, SCREEN_TIME_AVAILABLE, askPermission, countSettled, lastReportSince, permission, pickCount } from '@/platform/screenTime';
import { store } from '@/state/store';
import { COUNTS_SHORT, essentialsValue } from '@/ui/countWords';
import { EssentialsSteps, useEssentials } from '@/ui/EssentialsSteps';
import { BigButton, Card, StepButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { TodayTotal, WeekAverage } from '@/ui/UsageReport';
import { WaitingDots } from '@/ui/Waiting';
import { BatteryStory, DrainingBattery } from '@/ui/Welcome';
import { useDay } from '@/ui/useDay';

// The first launch, in five screens: what it is, Screen Time access, what
// counts, the goal, and a last check. Access comes first, so the goal screen
// can show the phone's own figures (today so far, and the last week's
// average) while the goal is picked; the old order asked for a goal before
// anything was known, and a quick tap-through could lock every app at once.
//
// Counting always takes in the day since the recharge, so the app can be
// installed at any time of day. The last screen registers the day with the
// locks held and shows Plainlimit's figure beside the phone's. If today is
// already past the goal, starting is not the main button: tomorrow is.
// Everything here can be changed later in Settings.

type Step = 'welcome' | 'access' | 'counts' | 'goal' | 'ready';

const STEPS: Step[] = SCREEN_TIME_AVAILABLE ? ['welcome', 'access', 'counts', 'goal', 'ready'] : ['welcome', 'counts', 'goal', 'ready'];

/**
 * How the last screen waits for the phone's report of the day so far: until
 * three quiet seconds after its last checkpoint, or half a minute if none
 * comes (little or no use yet today). Build 60 waited a fixed ten seconds; the
 * phone took thirteen to eighteen, so "Start counting" showed for a moment
 * over 0:00 before the figure jumped to the goal.
 */
const QUIET_MS = 3000;
const LONGEST_MS = 30_000;

type Button = { label: string; onPress: () => void };

/**
 * Why these figures are not the total in the iPhone's own Screen Time: the
 * owner compared the two on build 111 (5:31 here, 7 h 24 min there) and, as
 * the developer, wondered if the app was wrong. A new user would delete it.
 */
const sinceNote = (recharge: string) =>
  `Counted since ${recharge}, when your battery recharges, without your essentials. iPhone\u2019s Screen Time counts from midnight and includes everything, so it can show more.`;

export default function Setup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { now, settings, day, accent } = useDay();
  const [at, setAt] = useState(0);
  const [access, setAccess] = useState(() => (SCREEN_TIME_AVAILABLE ? permission() : 'unknown'));
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  // The last screen on a phone: reading the day so far, then ready.
  const [phase, setPhase] = useState<'reading' | 'ready' | 'failed'>('reading');
  const [waitedAt, setWaitedAt] = useState<number | null>(null);
  const previewed = useRef(false);

  const step = STEPS[at];
  const goTo = (s: Step) => setAt(Math.max(0, STEPS.indexOf(s)));
  const next = () => setAt((i) => Math.min(STEPS.length - 1, i + 1));
  const approved = access === 'approved';
  const canPick = SCREEN_TIME_AVAILABLE && approved;
  const picked = pickCount(COUNTED_ID);
  // Once the essentials are saved, setup moves on by itself.
  const essentials = useEssentials(next);
  const figures = canPick && picked > 0;
  // Only a phone with access and something ticked can count; anywhere else the last screen is a summary.
  const checking = step === 'ready' && figures;

  // Registers the day (locks held) on reaching the last screen, once.
  useEffect(() => {
    if (!checking || previewed.current) return;
    previewed.current = true;
    void store.previewCounting().then((ok) => {
      if (!ok) setPhase('failed');
      else setWaitedAt(Date.now());
    });
  }, [checking]);

  // Ready once the phone has had its say: at least ten seconds, and settled after any change (a new goal re-registers the day).
  useEffect(() => {
    if (!checking || phase === 'failed' || waitedAt === null) return;
    const look = () => {
      const now_ = Date.now();
      const last = lastReportSince(waitedAt);
      const heard = last !== null && now_ - last >= QUIET_MS;
      setPhase((heard || now_ - waitedAt >= LONGEST_MS) && countSettled(settings) ? 'ready' : 'reading');
    };
    look();
    const timer = setInterval(look, 1000);
    return () => clearInterval(timer);
  }, [checking, phase, waitedAt, settings]);

  const leave = (then: () => void | Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      // "I need more time" on a locked app works through a notification.
      await askToNotify();
      await then();
    } catch {
      // Today's own checks show anything that did not take; never leave the button stuck.
    } finally {
      setBusy(false);
    }
    router.replace('/');
  };

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await askPermission();
    setBusy(false);
    setAccess(answer);
    setAsked(true);
    if (answer === 'approved') next();
  };

  let body: ReactNode = null;
  let primary: Button = { label: 'Next', onPress: next };
  let secondary: Button | null = null;
  let quiet: Button | null = null;

  if (step === 'welcome') {
    body = (
      <>
        <DrainingBattery />
        <Heading>Your screen time is a battery</Heading>
        <BatteryStory recharge={clockLabel(settings.rechargeMinute)} />
      </>
    );
    primary = { label: 'Set it up', onPress: next };
  }

  if (step === 'access') {
    body = (
      <>
        <Heading>Allow Screen Time</Heading>
        <Lead>Plainlimit counts and locks apps through Apple&apos;s Screen Time. It never sees what you do in them.</Lead>
        {approved ? <Text style={styles.ok}>Allowed.</Text> : null}
        {asked && !approved ? (
          <Text style={styles.note}>It wasn&apos;t allowed, so nothing can be counted yet. Try again, or skip and allow it later in Settings.</Text>
        ) : null}
      </>
    );
    primary = approved ? { label: 'Next', onPress: next } : { label: busy ? 'One moment…' : asked ? 'Try again' : 'Allow', onPress: () => void allow() };
    if (asked && !approved) secondary = { label: 'Skip for now', onPress: next };
  }

  if (step === 'counts') {
    body = (
      <>
        <Heading>Your essentials</Heading>
        <Lead>{COUNTS_SHORT}</Lead>
        {canPick ? (
          <EssentialsSteps e={essentials} mainInFoot />
        ) : SCREEN_TIME_AVAILABLE ? (
          <Text style={styles.note}>You can set them once Screen Time is allowed, in Settings, under Essentials.</Text>
        ) : (
          <Text style={styles.note}>On an iPhone you tick them in Apple&apos;s own list of your apps. This preview runs on pretend use.</Text>
        )}
      </>
    );
    if (canPick && !essentials.ready) {
      // Between Apple's two lists the button waits, so a second tap can't open a list over the one on its way.
      primary = essentials.busy ? { label: 'One moment…', onPress: () => {} } : { label: 'Choose essentials', onPress: essentials.start };
      secondary = { label: 'Skip for now', onPress: next };
    }
  }

  if (step === 'goal') {
    body = (
      <>
        <Heading>How much a day?</Heading>
        {figures ? (
          <View style={styles.figureBox}>
            <View style={styles.figures}>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>{`Since ${clockLabel(settings.rechargeMinute)}`}</Text>
                <TodayTotal settings={settings} now={now} fallback={<WaitingDots />} />
              </View>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>Daily average</Text>
                <WeekAverage settings={settings} now={now} fallback={<WaitingDots />} />
              </View>
            </View>
            <Text style={styles.note}>{sinceNote(clockLabel(settings.rechargeMinute))} The average is over the last 7 days.</Text>
          </View>
        ) : null}
        <Lead>Pick a little under a normal day. You can change it later.</Lead>
        <Card style={{ paddingVertical: 18, gap: 10 }}>
          <View style={styles.stepper}>
            <StepButton sign="−" label="Less time" size={52} onPress={() => store.stepGoal(-1)} />
            <Text accessibilityLabel={`Daily goal, ${durationLabel(settings.goalMinutes)}`} style={[styles.big, { color: accent }]}>
              {durationLabel(settings.goalMinutes)}
            </Text>
            <StepButton sign="+" label="More time" size={52} onPress={() => store.stepGoal(1)} />
          </View>
          <Text style={styles.note}>Six cells of {cellWords(settings.goalMinutes)} each</Text>
        </Card>
        {/* The recharge time is not asked here: everyone starts at 6 AM, and changing it is Pro, in Settings (the owner, build 99). */}
        <Lead>{`It recharges at ${clockLabel(settings.rechargeMinute)} every day.`}</Lead>
      </>
    );
  }

  if (step === 'ready' && checking) {
    const recharge = clockLabel(settings.rechargeMinute);
    // Plainlimit's count stops at the goal: reaching it means today is already past.
    const over = phase === 'ready' && day.usedMinutes >= settings.goalMinutes;
    body = (
      <>
        <Heading>{phase === 'failed' ? 'Not counting yet' : over ? 'Already past your goal' : 'Ready'}</Heading>
        {/* On the plain ground, not a card: the phone draws its figure on the ground's own colour. */}
        <View style={styles.figureBox}>
          <View style={styles.figures}>
            <View style={styles.figure}>
              <Text style={styles.figureLabel}>Screen Time</Text>
              <TodayTotal settings={settings} now={now} fallback={<WaitingDots />} />
            </View>
            <View style={styles.figure}>
              <Text style={styles.figureLabel}>Plainlimit</Text>
              {phase === 'reading' && day.usedMinutes === 0 ? (
                <WaitingDots />
              ) : (
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.figureValue, { color: accent }]}>
                  {durationLabel(day.usedMinutes)}
                </Text>
              )}
            </View>
          </View>
          <Text style={[styles.note, { marginTop: 10 }]}>{sinceNote(recharge)}</Text>
        </View>
        {phase === 'reading' ? <ReadingBar colour={accent} /> : null}
        <Lead>
          {phase === 'reading'
            ? 'Reading today\u2019s Screen Time. This can take up to half a minute, and nothing locks yet.'
            : phase === 'failed'
              ? 'The phone would not start counting. You can turn it on later in Settings.'
              : over
                ? `You\u2019ve used more than ${durationLabel(settings.goalMinutes)} since ${recharge}, so starting now would lock your counted apps until ${recharge}.`
                : `The two should match, or Plainlimit can be up to ${tickStepMinutes(settings.goalMinutes)} minutes under.`}
        </Lead>
      </>
    );
    if (phase === 'failed') {
      primary = { label: 'Go to Today', onPress: () => void leave(() => store.finishSetup())() };
    } else if (phase === 'reading') {
      primary = { label: 'One moment…', onPress: () => {} };
    } else if (over) {
      primary = { label: busy ? 'One moment…' : `Start tomorrow at ${recharge}`, onPress: () => void leave(() => store.startTomorrow())() };
      secondary = { label: 'Raise my goal', onPress: () => goTo('goal') };
      quiet = { label: 'Lock now anyway', onPress: () => void leave(() => store.startCounting())() };
    } else {
      primary = { label: busy ? 'One moment…' : 'Start counting', onPress: () => void leave(() => store.startCounting())() };
      quiet = { label: 'Plainlimit is well above? Count from now instead', onPress: () => void leave(() => store.countFromNow())() };
    }
  } else if (step === 'ready') {
    body = (
      <>
        <Heading>You&apos;re set</Heading>
        <Card>
          <Row label="Daily goal" value={durationLabel(settings.goalMinutes)} />
          <Row label="Recharges at" value={clockLabel(settings.rechargeMinute)} />
          <Row label="Essentials" value={essentialsValue(SCREEN_TIME_AVAILABLE ? picked : -1, essentials.ready ? essentials.kept : null)} last />
        </Card>
        <Lead>
          {!SCREEN_TIME_AVAILABLE
            ? 'In this preview the battery runs on pretend use, from Settings.'
            : !approved
              ? 'Allow Screen Time in Settings when you are ready, and counting starts then.'
              : 'Set your essentials in Settings, under Essentials, and counting starts then.'}
        </Lead>
      </>
    );
    primary = { label: 'Go to Today', onPress: () => void leave(() => store.finishSetup())() };
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        {at > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => setAt((i) => Math.max(0, i - 1))} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View accessible accessibilityLabel={`Step ${at + 1} of ${STEPS.length}`} style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= at ? { backgroundColor: accent } : null]} />
          ))}
        </View>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body_} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        <BigButton label={primary.label} onPress={primary.onPress} />
        {secondary ? <BigButton quiet label={secondary.label} onPress={secondary.onPress} /> : null}
        {quiet ? (
          <Pressable accessibilityRole="button" accessibilityLabel={quiet.label} hitSlop={8} onPress={quiet.onPress} style={styles.quiet}>
            <Text style={styles.quietText}>{quiet.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {essentials.pickers}
    </View>
  );
}

/**
 * Something moving while the phone reads the day so far. The wait has no real
 * progress to report (the phone answers when it answers, within half a
 * minute), so the bar fills quickly at first and ever more slowly, and never
 * quite gets there; the screen changes when the figure is in. (The owner,
 * build 99: half a minute of a still screen looks stuck.)
 */
function ReadingBar({ colour }: { colour: string }) {
  const [filled] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = Animated.timing(filled, { toValue: 1, duration: LONGEST_MS + 5000, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [filled]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={'Reading today\u2019s Screen Time'} style={styles.bar}>
      <Animated.View style={[styles.barFill, { backgroundColor: colour, width: filled.interpolate({ inputRange: [0, 1], outputRange: ['4%', '96%'] }) }]} />
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>;
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last ? null : styles.rowRule]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  back: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.raised },
  body_: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, gap: 14 },
  heading: { fontFamily: display.bold, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.ink },
  lead: { fontSize: 16, lineHeight: 23, color: c.ink2 },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  ok: { fontSize: 16, fontWeight: '600', color: c.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big: { fontFamily: display.bold, fontSize: 60, lineHeight: 64, letterSpacing: -2.2, color: c.ink },
  figureBox: { borderWidth: 1, borderColor: c.rule, borderRadius: 18, padding: 16 },
  figures: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, gap: 4 },
  figureLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: c.ink3 },
  figureValue: { fontFamily: display.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.6, color: c.ink },
  foot: { paddingHorizontal: 20, paddingTop: 10, gap: 10, borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.ground },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 16, color: c.ink2 },
  rowValue: { fontSize: 16, fontWeight: '600', color: c.ink },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  quiet: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontSize: 14, color: c.ink3, textDecorationLine: 'underline' },
});
