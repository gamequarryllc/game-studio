import { useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { refusalNeedsAlert, refusalWords, type Refusal } from '@/domain/access';
import { cellWords } from '@/domain/battery';
import { clockLabel, durationLabel } from '@/domain/day';
import { askToNotify, openPhoneSettings } from '@/platform/notices';
import { SCREEN_TIME_AVAILABLE, askPermission, countSettled, lastReportSince, permission, refusal, wholeWindow } from '@/platform/screenTime';
import { store } from '@/state/store';
import { essentialsValue } from '@/ui/countWords';
import { useEssentials } from '@/ui/EssentialsSteps';
import { BigButton, Card, StepButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { Icon } from '@/ui/icons';
import { NotifyPicture, NotifyStory } from '@/ui/NotifyStep';
import { FreeRow, GoalStory, StoryBattery, StoryEssentials, StoryMorning, inTheMorning } from '@/ui/Story';
import { SetupFigures, WHOLE, WakeScreenTime, WholeTotal } from '@/ui/UsageReport';
import { WaitingDots } from '@/ui/Waiting';
import { useDay } from '@/ui/useDay';
import { useNotices } from '@/ui/useNotices';

// The first launch: the story in three screens (what it is, what is not counted,
// when it comes back; ui/Story.tsx), then Screen Time access, notifications,
// the goal, and a last check. Access comes before the goal, so the goal
// screen can show the phone's own figures (today so far, and the last week's
// average) while the goal is picked; the old order asked for a goal before
// anything was known, and a quick tap-through could lock every app at once.
//
// The story comes first and asks nothing: the owner's friend and cousin, shown
// build 167, could not say what the app was for or what its numbers were, so
// each of the three things it rests on has a screen and a picture of its own
// (the owner agreed the three and their order, 2026-11-27). It was one screen
// with four lines.
//
// Nothing is picked here: the phone counts everything (domain/tally.ts), so
// someone who taps straight through ends with a working app, and Today offers
// the essentials afterwards (ui/EssentialsOffer.tsx). The owner tried this
// beside a draft with one essentials step (builds 166 and 167) and kept this
// one: "they get through setup faster and then they get the last step as they
// get on the main page" (2026-11-26).
// (Up to build 165 setup opened Apple's list twice, the first time to tick
// "All Apps & Categories"; skipping it left nothing counted.)
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

type Step = 'welcome' | 'free' | 'morning' | 'access' | 'notify' | 'goal' | 'ready';

/** The screens, in order: the story's three, then what setup asks. Where there is no Screen Time (the preview) there is no access to ask for. */
const STEPS: Step[] = SCREEN_TIME_AVAILABLE ? ['welcome', 'free', 'morning', 'access', 'notify', 'goal', 'ready'] : ['welcome', 'free', 'morning', 'notify', 'goal', 'ready'];

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
  // Why iOS turned access down, when it did.
  const [refused, setRefused] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  // The last screen on a phone: reading the day so far, then ready.
  const [phase, setPhase] = useState<'reading' | 'ready' | 'failed'>('reading');
  const [waitedAt, setWaitedAt] = useState<number | null>(null);
  const previewed = useRef(false);
  // Whether notifications are allowed, read as setup opens and again whenever the app comes back to the front (from the iPhone's Settings, say).
  const [notify, setNotify] = useNotices();
  // Whether the goal screen's figures have been asked for, so they stay for the rest of setup.
  const [figuresShown, setFiguresShown] = useState(false);

  const step = STEPS[Math.min(at, STEPS.length - 1)];
  const goTo = (s: Step) => setAt(Math.max(0, STEPS.indexOf(s)));
  const next = () => setAt((i) => Math.min(STEPS.length - 1, i + 1));
  const approved = access === 'approved';
  const canPick = SCREEN_TIME_AVAILABLE && approved;
  // Setup doesn't ask for the essentials; this is for a phone that already has some (chosen under an older setup that was never finished).
  const essentials = useEssentials();
  // Everything counts from the start, so the phone's figures need nothing picked.
  const figures = canPick;
  // Only a phone with access can count; anywhere else the last screen is a summary.
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
    if (answer === 'approved') {
      setRefused(null);
      next();
      return;
    }
    // Say why (access.ts): iOS can refuse without showing anything, and then a pop-up shows the tap did something.
    const why = refusal() ?? 'declined';
    setRefused(why);
    if (refusalNeedsAlert(why)) Alert.alert(refusalWords(why).title, refusalWords(why).line);
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

  // The story: one thing a screen, a picture and a line (ui/Story.tsx).
  if (step === 'welcome') {
    body = (
      <>
        <Heading>Your screen time is a battery</Heading>
        <StoryBattery />
        <Text style={styles.say}>{'Using your apps drains it.\nWhen it\u2019s empty, they lock.'}</Text>
      </>
    );
  }

  if (step === 'free') {
    body = (
      <>
        <Heading>Your essential apps don&apos;t count</Heading>
        <StoryEssentials chosenLater={!(essentials.kept > 0)} />
      </>
    );
  }

  if (step === 'morning') {
    const morning = inTheMorning(settings.rechargeMinute);
    body = (
      <>
        <Heading>{morning ? 'Full again every morning' : 'Full again every day'}</Heading>
        <StoryMorning recharge={clockLabel(settings.rechargeMinute)} morning={morning} />
        <Text style={styles.say}>{`Your battery recharges at ${clockLabel(settings.rechargeMinute)}.`}</Text>
        {morning ? <Text style={[styles.lead, { color: c.ink3, marginTop: -8 }]}>A late night never eats into tomorrow.</Text> : null}
      </>
    );
  }

  if (step === 'access') {
    body = (
      <>
        <Heading>Allow Screen Time</Heading>
        <Lead>Plainlimit counts and locks apps through Apple&apos;s Screen Time. It never sees what you do in them.</Lead>
        {approved ? <Text style={styles.ok}>Allowed.</Text> : null}
        {asked && !approved ? (
          <View accessibilityRole="alert" style={styles.refused}>
            <Text style={styles.refusedTitle}>{refusalWords(refused ?? 'declined').title}</Text>
            <Text style={styles.note}>{`${refusalWords(refused ?? 'declined').line} Or skip, and turn it on later at the top of Settings.`}</Text>
          </View>
        ) : null}
      </>
    );
    primary = approved ? { label: 'Next', onPress: next } : { label: busy ? 'One moment…' : asked ? 'Try again' : 'Allow', onPress: () => void allow() };
    if (asked && !approved) secondary = { label: 'Skip for now', onPress: next };
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
      primary = { label: 'Open Settings', onPress: openPhoneSettings };
      secondary = { label: 'Skip for now', onPress: next };
    }
  }

  // The goal screen's figures and 7-day chart, drawn by the phone. They are
  // asked for one screen early, parked out of sight behind 'notify', so the
  // phone has a head start. Once asked for they stay for the rest of setup,
  // parked on the other screens, so Back and Next don't ask the phone to draw
  // them again: on build 127 the second drawing never came (the owner). They
  // take in every app but essentials already chosen, which the phone's picture
  // leaves out by itself (UsageReport.tsx, SetupFigures). Parked, they are drawn in full
  // under the screen in front (`cover`), not made clear: a clear view might
  // never be drawn, and the head start would be lost without a sign.
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
        <SetupFigures settings={settings} now={now} todayLabel="Today so far" />
        <Text style={styles.note}>{`Days start at ${recharge}. ${essentials.kept > 0 ? 'Your essentials are left out.' : 'Every app counts.'}`}</Text>
      </View>
    ) : null;

  if (step === 'goal') {
    // The goal comes first, over the chart, so it can be picked at once while
    // the phone is still drawing (the owner, build 144). With the phone's
    // figures under it: today and the daily average, then the last seven days
    // as bars with their times against the goal's line, which the stepper
    // moves (the owner picked the bars from five drafts, build 115, and asked
    // for the times and figures back, build 120). Without them, the words.
    //
    // What the number is, is said by the title and by three small pictures
    // under it: that much use, then the apps lock, then they are back at the
    // recharge time (GoalStory). It was "How much a day?" over "Moves the
    // line", and the owner's friend asked "how much what?" (build 167).
    head = (
      <>
        <Heading>Daily screen time</Heading>
        {figures ? null : <Lead>Pick a little under a normal day. You can change it later.</Lead>}
        <Card style={{ paddingVertical: 18, gap: 10 }}>
          <View style={styles.stepper}>
            <StepButton sign="−" label="Less time" size={52} onPress={() => store.stepGoal(-1)} />
            <Text accessibilityLabel={`Daily screen time, ${durationLabel(settings.goalMinutes)}`} style={[styles.big, { color: accent }]}>
              {durationLabel(settings.goalMinutes)}
            </Text>
            <StepButton sign="+" label="More time" size={52} onPress={() => store.stepGoal(1)} />
          </View>
          {figures ? null : <Text style={styles.note}>{`Six cells of ${cellWords(settings.goalMinutes)} each`}</Text>}
        </Card>
        {/* The recharge time is not asked here: everyone starts at 6 AM, and changing it is Pro, in Settings (the owner, build 99). */}
        <GoalStory goal={durationLabel(settings.goalMinutes)} recharge={recharge} />
      </>
    );
  }

  if (step === 'ready' && checking) {
    // Plainlimit's count stops at the goal: reaching it means today is already past.
    const over = phase === 'ready' && day.usedMinutes >= settings.goalMinutes;
    // Plainlimit's own figure, until the phone has reported anything for today.
    const reading = phase === 'reading' && day.usedMinutes === 0;
    // What Plainlimit counts, beside everything the iPhone tracks.
    const since = `Since ${recharge}`;
    const left = Math.max(0, settings.goalMinutes - day.usedMinutes);
    body = (
      <>
        <Heading>{phase === 'failed' ? 'Not counting yet' : over ? 'Already past your goal' : 'Ready'}</Heading>
        {/*
          Why Plainlimit's figure is not the total in the iPhone's own Screen Time, as a picture: the iPhone's whole day
          is the outer box, and what uses the battery is a part inside it. (The owner compared the two on build 111,
          5:31 here against 7 h 24 min there, and wondered if the app was wrong; up to build 141 a paragraph said why,
          beside the phone's figure for the counted apps alone, which nearly matched Plainlimit's and looked pointless.)
          On the plain ground, not a card: the phone draws its figure on the ground's own colour.

          The boxes were named "iPhone Screen Time" and "Plainlimit counts" up to build 167, and the owner's friend did
          not know what either figure was. Now each says what it is in the person's own terms (the whole day; what uses
          the battery), and the inner one shows how much of the goal that is, as a bar with what is left under it (the
          owner picked this from three drafts, 2026-11-27).

          On build 168 the owner wanted the screen to say outright what the two are: what the iPhone tracks against
          what we count, and that nobody is punished for using their essentials. So the boxes are named for who
          counts ("iPhone tracks", "Plainlimit counts"), and the essentials lie in the iPhone's box but outside
          ours, marked "Never counted". They are not chosen yet at this point (Today offers them next), so the row is a
          promise in the story's own picture, not a figure with them taken out.
        */}
        <View style={styles.whole}>
          <View style={styles.wholeRow}>
            <Icon name="iphone" size={18} color={c.ink2} />
            <View style={styles.wholeWords}>
              <Text style={styles.wholeName}>iPhone tracks</Text>
              <Text style={styles.wholeNote}>{wholeWindow(settings, now).sinceYesterday ? 'Everything, since yesterday' : 'Everything, since midnight'}</Text>
            </View>
            <WholeTotal settings={settings} now={now} fallback={<WaitingDots size={6} height={WHOLE.height} />} />
          </View>
          <View
            accessible
            accessibilityLabel={reading ? `Plainlimit counts: still reading. ${since}` : `Plainlimit counts: ${durationLabel(day.usedMinutes)} of ${durationLabel(settings.goalMinutes)}. ${since}. ${durationLabel(left)} left today`}
            style={[styles.part, { borderColor: accent, backgroundColor: accent.length === 7 ? `${accent}1F` : 'transparent' }]}>
            <View style={styles.wholeRow}>
              <Icon name="battery" size={18} color={accent} />
              <View style={styles.wholeWords}>
                <Text style={[styles.wholeName, { color: c.ink }]}>Plainlimit counts</Text>
                <Text style={[styles.wholeNote, { color: c.ink2 }]}>{since}</Text>
              </View>
              {reading ? (
                <WaitingDots size={8} height={44} />
              ) : (
                <Text numberOfLines={1} style={[styles.partValue, { color: accent }]}>
                  {durationLabel(day.usedMinutes)}
                </Text>
              )}
            </View>
            {/* How much of the goal that is. Empty while the day is still being read. */}
            <View style={styles.meter}>
              <View style={[styles.meterFill, { backgroundColor: accent, width: `${reading ? 0 : Math.min(100, Math.round((day.usedMinutes / Math.max(1, settings.goalMinutes)) * 100))}%` }]} />
            </View>
            <View style={styles.meterWords}>
              <Text style={styles.meterText}>{reading ? 'Reading\u2026' : `${durationLabel(left)} left today`}</Text>
              <Text style={styles.meterText}>{`of ${durationLabel(settings.goalMinutes)}`}</Text>
            </View>
          </View>
          <FreeRow />
        </View>
        {phase === 'reading' ? <ReadingBar colour={accent} /> : null}
        {phase === 'reading' ? (
          <Lead>Reading today so far. Nothing locks yet.</Lead>
        ) : phase === 'failed' ? (
          <Lead>iOS would not start counting. You can turn it on later at the top of Settings.</Lead>
        ) : over ? (
          <Lead>{`You\u2019ve used more than ${durationLabel(settings.goalMinutes)} since ${recharge}, so starting now would lock ${essentials.kept > 0 ? 'everything but your essentials' : 'your apps'} until ${recharge}.`}</Lead>
        ) : !essentials.ready ? (
          <Text style={styles.next}>You pick your essential apps next.</Text>
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
          <Row label="Essentials" value={essentialsValue(essentials.ready ? essentials.kept : null, SCREEN_TIME_AVAILABLE)} last />
        </Card>
        <Lead>
          {!SCREEN_TIME_AVAILABLE ? 'In this preview the battery runs on pretend use, from Settings.' : 'Allow Screen Time in Settings when you are ready, and counting starts then.'}
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
  // The one line under a story screen's picture.
  say: { fontSize: 19, lineHeight: 27, color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  next: { fontSize: 16, lineHeight: 22, color: c.ink3, paddingHorizontal: 6 },
  ok: { fontSize: 16, fontWeight: '600', color: c.ink },
  warn: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#FF7B6B' },
  refused: { alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#F79200', borderRadius: 14, padding: 12, gap: 4 },
  refusedTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#F7B24D' },
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
  // How much of the goal is used, as a bar, with what is left under it.
  meter: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginTop: 12 },
  meterFill: { height: 10, borderRadius: 5 },
  meterWords: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  meterText: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: c.ink2 },
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
