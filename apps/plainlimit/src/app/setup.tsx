import { useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cellWords } from '@/domain/battery';
import { clockLabel, durationLabel } from '@/domain/day';
import { askToNotify, notifyState, type NotifyAnswer } from '@/platform/notices';
import { COUNTED_ID, SCREEN_TIME_AVAILABLE, askPermission, countSettled, lastReportSince, permission, pickCount, wholeWindow } from '@/platform/screenTime';
import { store } from '@/state/store';
import { COUNTS_SHORT, essentialsValue } from '@/ui/countWords';
import { EssentialsSteps, useEssentials } from '@/ui/EssentialsSteps';
import { BigButton, Card, StepButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { Icon } from '@/ui/icons';
import { NotifyPicture, NotifyStory } from '@/ui/NotifyStep';
import { SetupFigures, WHOLE, WakeScreenTime, WholeTotal } from '@/ui/UsageReport';
import { WaitingDots } from '@/ui/Waiting';
import { BatteryStory, DrainingBattery } from '@/ui/Welcome';
import { useDay } from '@/ui/useDay';

// The first launch, in six screens: what it is, Screen Time access, what
// counts, notifications, the goal, and a last check. Access comes first, so
// the goal screen can show the phone's own figures (today so far, and the
// last week's average) while the goal is picked; the old order asked for a
// goal before anything was known, and a quick tap-through could lock every
// app at once.
//
// The phone's first drawing after an install can take a minute, and the app
// can't tell when it is done. So setup starts early: Screen Time is woken as
// soon as access is allowed (WakeScreenTime), and the goal screen's chart is
// asked for one screen ahead, out of sight behind 'notify'. That screen is not
// there to fill time: the notifications question used to come cold, after
// "Start counting", and the owner had it moved to where its reason can be
// said and the wait is covered by something setup needs anyway (build 144).
//
// Counting always takes in the day since the recharge, so the app can be
// installed at any time of day. The last screen registers the day with the
// locks held and shows Plainlimit's figure beside the phone's. If today is
// already past the goal, starting is not the main button: tomorrow is.
// Everything here can be changed later in Settings.

type Step = 'welcome' | 'access' | 'counts' | 'notify' | 'goal' | 'ready';

const STEPS: Step[] = SCREEN_TIME_AVAILABLE ? ['welcome', 'access', 'counts', 'notify', 'goal', 'ready'] : ['welcome', 'counts', 'notify', 'goal', 'ready'];

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

/** How tall the goal screen's figures are while parked behind another screen. */
const PARKED = 330;


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
  // Whether notifications are allowed, read as setup opens and again whenever the app comes back to the front (from the iPhone's Settings, say).
  const [notify, setNotify] = useState<NotifyAnswer>('unasked');
  // Whether the goal screen's figures have been asked for, so they stay for the rest of setup.
  const [figuresShown, setFiguresShown] = useState(false);

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

  useEffect(() => {
    let live = true;
    const read = () => void notifyState().then((answer) => (live ? setNotify(answer) : undefined));
    read();
    const watch = AppState.addEventListener('change', (state) => (state === 'active' ? read() : undefined));
    return () => {
      live = false;
      watch.remove();
    };
  }, []);

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
      // "I need more time" on a locked app works through a notification. The question has its own screen now;
      // this is its second chance for anyone who tapped "Not now" there (the iPhone puts it once, so otherwise it is silent).
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

  const allowNotices = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await askToNotify();
    setBusy(false);
    setNotify(answer);
    // Turned down: stay, and say what that costs.
    if (answer === 'on') next();
  };

  // The goal screen's own words go in `head`, over the phone's figures; every other screen's go in `body`, which covers the figures while they are parked.
  let head: ReactNode = null;
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

  if (step === 'notify') {
    // Needed, and said so: without notifications the empty screen's "I need more time" leads nowhere (the owner, 2026-11-22).
    body = (
      <>
        <NotifyPicture />
        <Heading>Notifications need to be on</Heading>
        <NotifyStory />
        {notify === 'on' ? (
          <Text style={styles.ok}>{'They\u2019re on.'}</Text>
        ) : notify === 'off' ? (
          <Text accessibilityRole="alert" style={styles.warn}>
            {'They\u2019re off, so asking for more time on a locked app won\u2019t do anything. Turn them on in the iPhone\u2019s Settings.'}
          </Text>
        ) : (
          <Lead>Without them, asking for more time on a locked app does nothing.</Lead>
        )}
      </>
    );
    if (notify === 'unasked') {
      primary = { label: busy ? 'One moment…' : 'Allow notifications', onPress: () => void allowNotices() };
      secondary = { label: 'Not now', onPress: next };
    } else if (notify === 'off') {
      primary = { label: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => {}) };
      secondary = { label: 'Skip for now', onPress: next };
    }
  }

  // The goal screen's figures and 7-day chart, drawn by the phone. They are
  // asked for one screen early, parked out of sight behind 'notify', so the
  // phone has a head start. Once asked for they stay for the rest of setup,
  // parked on the other screens, so Back and Next don't ask the phone to draw
  // them again: on build 127 the second drawing never came (the owner). They
  // are drawn again only when the essentials change, which changes what they
  // count. Parked, they are drawn in full under the screen in front (`cover`),
  // not made clear: a clear view might never be drawn, and the head start
  // would be lost without a sign.
  const recharge = clockLabel(settings.rechargeMinute);
  if ((step === 'notify' || step === 'goal') && figures && !figuresShown) setFiguresShown(true);
  const figureBox =
    figures && figuresShown ? (
      <View
        key="figures"
        pointerEvents={step === 'goal' ? 'auto' : 'none'}
        accessibilityElementsHidden={step !== 'goal'}
        importantForAccessibility={step === 'goal' ? 'auto' : 'no-hide-descendants'}
        style={[styles.figureBox, { gap: 12 }, step === 'goal' ? null : styles.parked]}>
        {/* One picture from the phone for both figures and the chart, so they arrive together (UsageReport.tsx). */}
        <SetupFigures settings={settings} now={now} todayLabel={`Since ${recharge}`} />
        <Text style={styles.note}>{`Days start at ${recharge}. Essentials not counted.`}</Text>
      </View>
    ) : null;

  if (step === 'goal') {
    // The goal comes first, over the chart, so it can be picked at once while
    // the phone is still drawing (the owner, build 144). With the phone's
    // figures under it: today and the daily average, then the last seven days
    // as bars with their times against the goal's line, which the stepper
    // moves (the owner picked the bars from five drafts, build 115, and asked
    // for the times and figures back, build 120). Without them, the words.
    head = (
      <>
        <Heading>How much a day?</Heading>
        {figures ? null : <Lead>Pick a little under a normal day. You can change it later.</Lead>}
        <Card style={{ paddingVertical: 18, gap: 10 }}>
          <View style={styles.stepper}>
            <StepButton sign="−" label="Less time" size={52} onPress={() => store.stepGoal(-1)} />
            <Text accessibilityLabel={`Daily goal, ${durationLabel(settings.goalMinutes)}`} style={[styles.big, { color: accent }]}>
              {durationLabel(settings.goalMinutes)}
            </Text>
            <StepButton sign="+" label="More time" size={52} onPress={() => store.stepGoal(1)} />
          </View>
          <Text style={[styles.note, figures ? { textAlign: 'center' } : null]}>{figures ? 'Moves the line' : `Six cells of ${cellWords(settings.goalMinutes)} each`}</Text>
        </Card>
        {/* The recharge time is not asked here: everyone starts at 6 AM, and changing it is Pro, in Settings (the owner, build 99). */}
        {figures ? null : <Lead>{`It recharges at ${recharge} every day.`}</Lead>}
      </>
    );
  }

  if (step === 'ready' && checking) {
    // Plainlimit's count stops at the goal: reaching it means today is already past.
    const over = phase === 'ready' && day.usedMinutes >= settings.goalMinutes;
    // Plainlimit's own figure, until the phone has reported anything for today.
    const reading = phase === 'reading' && day.usedMinutes === 0;
    body = (
      <>
        <Heading>{phase === 'failed' ? 'Not counting yet' : over ? 'Already past your goal' : 'Ready'}</Heading>
        {/*
          Why Plainlimit's figure is not the total in the iPhone's own Screen Time, as a picture: the iPhone's whole day
          is the outer box, and what Plainlimit counts is a part inside it. (The owner compared the two on build 111,
          5:31 here against 7 h 24 min there, and wondered if the app was wrong; up to build 141 a paragraph said why,
          beside the phone's figure for the counted apps alone, which nearly matched Plainlimit's and looked pointless.)
          On the plain ground, not a card: the phone draws its figure on the ground's own colour.
        */}
        <View style={styles.whole}>
          <View style={styles.wholeRow}>
            <Icon name="iphone" size={18} color={c.ink2} />
            <View style={styles.wholeWords}>
              <Text style={styles.wholeName}>iPhone Screen Time</Text>
              <Text style={styles.wholeNote}>{wholeWindow(settings, now).sinceYesterday ? 'Every app, since yesterday' : 'Every app, since midnight'}</Text>
            </View>
            <WholeTotal settings={settings} now={now} fallback={<WaitingDots size={6} height={WHOLE.height} />} />
          </View>
          <View
            accessible
            accessibilityLabel={`Plainlimit counts ${reading ? 'still reading' : durationLabel(day.usedMinutes)}, without essentials, since ${recharge}`}
            style={[styles.part, { borderColor: accent, backgroundColor: accent.length === 7 ? `${accent}1F` : 'transparent' }]}>
            <View style={styles.wholeRow}>
              <Icon name="battery" size={18} color={accent} />
              <Text style={[styles.wholeName, styles.wholeWords, { color: c.ink }]}>Plainlimit counts</Text>
              {reading ? (
                <WaitingDots size={8} height={44} />
              ) : (
                <Text numberOfLines={1} style={[styles.partValue, { color: accent }]}>
                  {durationLabel(day.usedMinutes)}
                </Text>
              )}
            </View>
            <Text style={[styles.wholeNote, styles.partNote]}>{`Without essentials, since ${recharge}`}</Text>
          </View>
        </View>
        {phase === 'reading' ? <ReadingBar colour={accent} /> : null}
        {phase === 'reading' ? (
          <Lead>Reading today so far. Nothing locks yet.</Lead>
        ) : phase === 'failed' ? (
          <Lead>The phone would not start counting. You can turn it on later in Settings.</Lead>
        ) : over ? (
          <Lead>{`You\u2019ve used more than ${durationLabel(settings.goalMinutes)} since ${recharge}, so starting now would lock your counted apps until ${recharge}.`}</Lead>
        ) : null}
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
      quiet = { label: 'Looks wrong? Count from now', onPress: () => void leave(() => store.countFromNow())() };
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
        {/* Three places, always in this order, so the figures are never moved (which would draw them again): over them the goal screen's words, and after them, in front, every other screen. */}
        <Fragment key="head">{head}</Fragment>
        {figureBox}
        {body ? (
          <View key="body" style={[styles.screen, figureBox ? styles.cover : null]}>
            {body}
          </View>
        ) : null}
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
      {/* Until the goal screen's own figures are asked for; never both at once. */}
      {canPick && !figuresShown ? <WakeScreenTime settings={settings} now={now} /> : null}
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
  warn: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#FF7B6B' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big: { fontFamily: display.bold, fontSize: 60, lineHeight: 64, letterSpacing: -2.2, color: c.ink },
  figureBox: { borderWidth: 1, borderColor: c.rule, borderRadius: 18, padding: 16 },
  // A screen's own things, spaced as the scroll view spaces its own.
  screen: { gap: 14 },
  // Out of sight on the other screens, at the same width, so the phone's drawings keep their size and are not redrawn:
  // where the screen in front begins, no taller than its cover.
  parked: { position: 'absolute', top: 18, left: 24, right: 24, maxHeight: PARKED, overflow: 'hidden' },
  // The screen in front of the parked figures: the ground's colour, and at least as tall as they are.
  cover: { minHeight: PARKED, backgroundColor: c.ground },
  // Setup's last screen: the iPhone's whole day as the outer box, and Plainlimit's part of it inside.
  whole: { borderWidth: 1.5, borderColor: c.outline, borderRadius: 20, padding: 14, gap: 12 },
  wholeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wholeWords: { flex: 1 },
  wholeName: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: c.ink2 },
  wholeNote: { fontSize: 13.5, lineHeight: 18, color: c.ink3, marginTop: 2 },
  part: { borderWidth: 2, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 13 },
  partValue: { fontFamily: display.bold, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  // Under the name, clear of the picture beside it.
  partNote: { marginLeft: 26, color: c.ink2 },
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
