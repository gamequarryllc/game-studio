import { useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { refusalNeedsAlert, refusalWords, type Refusal } from '@/domain/access';
import { CELLS, cellShort, cellWords } from '@/domain/battery';
import { clockLabel, durationLabel } from '@/domain/day';
import { glowAt, glowForCells } from '@/domain/tone';
import { tap } from '@/platform/haptics';
import { askToNotify, openPhoneSettings } from '@/platform/notices';
import { MOCK_PHONE, SCREEN_TIME_AVAILABLE, askPermission, countSettled, lastReportSince, permission, refusal, wholeWindow } from '@/platform/screenTime';
import { store } from '@/state/store';
import { essentialsValue } from '@/ui/countWords';
import { EssentialsSteps, useEssentials } from '@/ui/EssentialsSteps';
import { TopLight } from '@/ui/GlowBattery';
import { BigButton, Card, StepButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { NotifyPicture, NotifyStory } from '@/ui/NotifyStep';
import { EssentialsDock, GoalStory, HeroBattery, heroHeight, StoryBattery, StoryEssentials, StoryMorning, inTheMorning } from '@/ui/Story';
import { SetupFigures, TodayTotal, WHOLE, WakeScreenTime, WholeTotal } from '@/ui/UsageReport';
import { WaitingDots } from '@/ui/Waiting';
import { useDay } from '@/ui/useDay';
import { useNotices } from '@/ui/useNotices';

// The first launch: the story in three screens (what it is, what is not counted,
// when it comes back; ui/Story.tsx), then Screen Time access, the essentials,
// notifications, the goal, and a last check. Access comes before the goal, so
// the goal screen can show the phone's own figures (today so far, and the last
// week's average) while the goal is picked; the old order asked for a goal
// before anything was known, and a quick tap-through could lock every app at once.
//
// The story comes first and asks nothing: the owner's friend and cousin, shown
// build 167, could not say what the app was for or what its numbers were, so
// each of the three things it rests on has a screen and a picture of its own
// (the owner agreed the three and their order, 2026-11-27). It was one screen
// with four lines.
//
// The essentials are offered before the goal, on one screen that can be
// skipped. The phone counts everything (domain/tally.ts), so someone who taps
// straight through still ends with a working app, and Today offers the
// essentials afterwards (ui/EssentialsOffer.tsx). Builds 168 and 169 had no
// such screen: the owner had tried one beside none (builds 166 and 167) and
// kept none, "they get through setup faster and then they get the last step
// as they get on the main page" (2026-11-26). Then, on build 169, the owner
// saw what that does to the goal: its chart and average were all of the
// phone's time, essentials and all, so a goal picked against them is looser
// than it looks. Chosen first, the essentials are left out of the goal
// screen's figures, and the last screen shows what will really be counted.
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
//
// The look (build 173, the owner's pick from eight drafts, "Home screen",
// 2026-11-27): no boxes. A faint green light from the top of the page, like
// a wallpaper; Today's own battery wherever a battery is drawn; apps that
// look like apps (ui/BrandApp.tsx); the step's dots at the top right; one
// green button. Build 172's setup was "very ai slopped looking": every
// screen the same stack of dark rounded boxes under small capital labels.

type Step = 'welcome' | 'free' | 'morning' | 'access' | 'essentials' | 'notify' | 'goal' | 'ready';

/** The screens, in order: the story's three, then what setup asks. Where there is no Screen Time (the preview) there is no access to ask for. */
const STEPS: Step[] = SCREEN_TIME_AVAILABLE ? ['welcome', 'free', 'morning', 'access', 'essentials', 'notify', 'goal', 'ready'] : ['welcome', 'free', 'morning', 'essentials', 'notify', 'goal', 'ready'];

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
 * How far under the last screen's battery its light reaches. The phone draws that screen's figures on the plain
 * ground, so they must start below it: the word (68), the figure's name (20) and the gaps between come to more.
 */
const READY_REACH = 104;

/** How tall the goal screen's figures are while parked behind another screen. */
const PARKED = 330;

/** The top bar under the clock: Back and the dots. */
const BAR = 50;

/** From the top bar to a screen's first thing. */
const UNDER_BAR = 8;

/**
 * The goal screen on a phone, without its battery: the title (38), the stepper (66), the three small pictures (57),
 * the figures' name (24), the phone's picture (262), the line under it (20), and the gaps between and after them
 * (four of 10, two of 6, 10 at the end), with a few points to spare. What is left of the screen is the battery's.
 */
const GOAL_REST = 537;

/** The button at the foot, and the room over it. */
const FOOT = 66;

/** The light from the top of the page: the battery's green, a little towards the sea (#41C896). */
const WALLPAPER = '65, 200, 150';


export default function Setup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { now, settings, day, accent, cells, fraction } = useDay();
  const window = useWindowDimensions();
  // The top bar lies over the page, which runs up under it, so the battery's light is not cut off at the bar.
  const bar = insets.top + BAR;
  // Clear of the bar at the foot of an iPhone's screen, and no further.
  const footBottom = Math.max(insets.bottom, 8) + 8;
  const [scrollY] = useState(() => new Animated.Value(0));
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // A full battery's green: the button, the goal and its battery.
  const full = glowForCells(CELLS);
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

  // Each screen starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [at]);

  const step = STEPS[Math.min(at, STEPS.length - 1)];
  const goTo = (s: Step) => setAt(Math.max(0, STEPS.indexOf(s)));
  const next = () => setAt((i) => Math.min(STEPS.length - 1, i + 1));
  const approved = access === 'approved';
  const canPick = SCREEN_TIME_AVAILABLE && approved;
  // Once the essentials are saved, setup moves on by itself.
  const essentials = useEssentials(next);
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
        <Heading>{'Your screen time\nis a battery'}</Heading>
        <StoryBattery />
        <Text style={styles.say}>{'Using your apps drains it.\nWhen it\u2019s empty, they lock.'}</Text>
      </>
    );
  }

  if (step === 'free') {
    body = (
      <>
        <Heading>{'Your essential apps\ndon\u2019t count'}</Heading>
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

  if (step === 'essentials') {
    // Apple's list opens once, for the essentials alone. Skipping is safe: everything counts until they are chosen, and Today offers them again.
    const showPick = canPick || MOCK_PHONE;
    body = (
      <>
        <Heading>{essentials.ready ? 'Your essential apps' : 'Pick your\nessential apps'}</Heading>
        {essentials.ready ? null : <Lead>They never count and never lock.</Lead>}
        {showPick ? (
          <EssentialsSteps e={essentials} mainInFoot />
        ) : SCREEN_TIME_AVAILABLE ? (
          <Text style={styles.note}>You can pick them once Screen Time is allowed, on Today. Until then every app counts.</Text>
        ) : (
          <Text style={styles.note}>On an iPhone you tick them in Apple&apos;s own list of your apps. This preview runs on pretend use.</Text>
        )}
      </>
    );
    if (essentials.saving) {
      // Apple's list has closed and the picks are being saved (up to a second): say so, and offer nothing to tap twice.
      primary = { label: 'Saving\u2026', onPress: () => {} };
    } else if (showPick && !essentials.ready) {
      primary = { label: 'Choose essential apps', onPress: canPick ? essentials.start : next };
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
      primary = { label: 'Open Settings', onPress: openPhoneSettings };
      secondary = { label: 'Skip for now', onPress: next };
    }
  }

  // The goal screen's figures and 7-day chart, drawn by the phone. They are
  // asked for one screen early, parked out of sight behind 'notify', so the
  // phone has a head start. Once asked for they stay for the rest of setup,
  // parked on the other screens, so Back and Next don't ask the phone to draw
  // them again: on build 127 the second drawing never came (the owner). They
  // take in every app but the essentials chosen two screens back, which the
  // phone's picture leaves out by itself (UsageReport.tsx, SetupFigures). Parked, they are drawn in full
  // under the screen in front (`cover`), not made clear: a clear view might
  // never be drawn, and the head start would be lost without a sign.
  const recharge = clockLabel(settings.rechargeMinute);
  if ((step === 'notify' || step === 'goal') && figures && !figuresShown) setFiguresShown(true);
  const figuresName = essentials.kept > 0 ? 'Your phone time' : 'All your phone time';
  const figuresNote = essentials.kept > 0 ? 'Without your essential apps' : 'Every app. Your essential apps won\u2019t count.';
  const figureBox =
    figures && figuresShown ? (
      <View
        key="figures"
        pointerEvents={step === 'goal' ? 'auto' : 'none'}
        accessibilityElementsHidden={step !== 'goal'}
        importantForAccessibility={step === 'goal' ? 'auto' : 'no-hide-descendants'}
        style={[styles.figureBox, step === 'goal' ? styles.figureBoxClose : null, step === 'goal' ? null : [styles.parked, { top: bar + UNDER_BAR }]]}>
        {/*
          What the figures are, said over them. They are everything the phone has been used for: no essentials are
          chosen yet, and Plainlimit has counted nothing before today. The owner, on build 169 with a daily average
          of 5:24 there, asked whether that was Plainlimit's average, and saw that a goal picked against all of the
          phone's time is looser than it looks, since the essentials will not count. ("Every app counts." stood in
          the small line under the chart, and did not say it.) On the page itself, with no box round them (build 173).
        */}
        <View accessible accessibilityLabel={`${figuresName}. ${figuresNote}`} style={styles.figuresHead}>
          <Text style={styles.figuresName}>{figuresName}</Text>
          <Text style={styles.figuresNote}>{figuresNote}</Text>
        </View>
        {/* One picture from the phone for both figures and the chart, so they arrive together (UsageReport.tsx). */}
        <SetupFigures settings={settings} now={now} todayLabel="Today so far" />
        <Text style={styles.note}>{`Days start at ${recharge}.`}</Text>
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
    // On a phone the figures and the chart are on this screen too, and all of it should be in view at once (the goal
    // is picked against the chart). So there the number is a little smaller, the gaps are closer (`close`), and the
    // battery takes the room that is left: full size on a tall phone, never under 0.55 of it (a short phone scrolls).
    const fullBattery = heroHeight(window.width);
    const room = window.height - (bar + UNDER_BAR) - (FOOT + footBottom) - GOAL_REST - (essentials.kept > 0 ? 0 : 18);
    const goalScale = figures ? Math.max(0.55, Math.min(1, room / fullBattery)) : 1;
    head = (
      <>
        <Heading>Daily screen time</Heading>
        {figures ? null : <Lead>Pick a little under a normal day. You can change it later.</Lead>}
        <View style={styles.stepper}>
          <StepButton filled sign="−" label="Less time" size={figures ? 50 : 54} onPress={() => store.stepGoal(-1)} />
          <Text numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`Daily screen time, ${durationLabel(settings.goalMinutes)}`} style={[styles.big, figures ? styles.bigClose : null, { color: full }]}>
            {durationLabel(settings.goalMinutes)}
          </Text>
          <StepButton filled sign="+" label="More time" size={figures ? 50 : 54} onPress={() => store.stepGoal(1)} />
        </View>
        {/* The goal as the battery it fills: Today's battery, full, with one cell's length in its first cell. */}
        <View accessible accessibilityRole="image" accessibilityLabel={`A full battery: six cells of ${cellWords(settings.goalMinutes)} each`}>
          <HeroBattery cells={CELLS} color={full} first={cellShort(settings.goalMinutes)} reach={64} strength={0.8} scale={goalScale} />
        </View>
        {figures ? null : <Text style={styles.note}>{`Six cells of ${cellWords(settings.goalMinutes)} each`}</Text>}
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
    // Plainlimit's own figure, in the type the phone draws its exact one in (UsageReport.tsx, TodayTotal).
    const own = (
      <Text numberOfLines={1} style={styles.partValue}>
        {durationLabel(day.usedMinutes)}
      </Text>
    );
    // The day's colour as light, as on Today: the battery, the word and the name of Plainlimit's figure.
    const glow = glowAt(fraction);
    const everything = wholeWindow(settings, now).sinceYesterday ? 'Everything,\nsince yesterday' : 'Everything,\nsince midnight';
    body = (
      <>
        {/*
          The screen is Today's, a minute early: Today's battery in its light, then the word in the day's colour
          (build 173; the owner's pick, and the screen of the app the owner likes best). Until the day has been read
          the battery stands full.
        */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <HeroBattery cells={reading ? CELLS : cells} color={reading ? full : glow} lock={over} reach={READY_REACH} />
        </View>
        {phase === 'failed' || over ? (
          <>
            <Heading>{phase === 'failed' ? 'Not counting yet' : 'Already past your goal'}</Heading>
            {/* What that means, straight under it: at the foot of the screen it was below the dock, and cut off on most phones. */}
            {phase === 'failed' ? (
              <Lead>iOS would not start counting. You can turn it on later at the top of Settings.</Lead>
            ) : (
              <Lead>{`You\u2019ve used more than ${durationLabel(settings.goalMinutes)} since ${recharge}, so starting now would lock ${essentials.kept > 0 ? 'everything but your essentials' : 'your apps'} until ${recharge}.`}</Lead>
            )}
          </>
        ) : (
          <Text accessibilityRole="header" style={[styles.giant, { color: reading ? full : glow }]}>
            Ready
          </Text>
        )}
        {/*
          Why Plainlimit's figure is not the total in the iPhone's own Screen Time: the two stand side by side, each
          named for who counts. (The owner compared the two on build 111, 5:31 here against 7 h 24 min there, and
          wondered if the app was wrong; up to build 141 a paragraph said why, beside the phone's figure for the
          counted apps alone, which nearly matched Plainlimit's and looked pointless. Up to build 172 they were a box
          in a box: the iPhone's whole day outside, Plainlimit's part inside, with a bar for how much of the goal it
          was. The battery over them says that now.)

          The boxes were named "iPhone Screen Time" and "Plainlimit counts" up to build 167, and the owner's friend did
          not know what either figure was. On build 168 the owner wanted the screen to say outright what the two are:
          what the iPhone tracks against what we count, and that nobody is punished for using their essentials. So
          they are named for who counts ("Plainlimit counts", "iPhone tracks"), and the essentials stand under them,
          marked "Never counted".

          Build 170 chose the essentials before this screen, and the owner's recording of it showed three figures
          for the same thing within ten seconds: 0:25 on the goal screen, 0:15 here, 0:25 on Today. 0:25 was the
          phone's exact figure; 0:15 was Plainlimit's own, which hears of use in steps and gives the essentials the
          benefit of the doubt up to their next rung (domain/tally.ts). So the figure here is drawn the way Today's
          is, by the phone, over Plainlimit's own (which stands until it has drawn, and wherever it can't). The
          phone's picture is not see-through, so it stands clear of the battery's light (READY_REACH), on the plain
          ground, and the figure is in the ink Today's is in. "2:45 left today" went with it: the goal less a figure
          the app cannot read is not a number it can write. And the dock of essentials shows the person's own, now
          that there are some.
        */}
        <View style={styles.counts}>
          <View
            accessible
            accessibilityLabel={reading ? `Plainlimit counts: still reading. ${since}` : `Plainlimit counts: about ${durationLabel(day.usedMinutes)} used of ${durationLabel(settings.goalMinutes)}. ${since}`}
            style={styles.ours}>
            <Text numberOfLines={1} style={[styles.countsName, { color: reading ? full : glow }]}>
              Plainlimit counts
            </Text>
            {reading ? (
              <WaitingDots size={8} height={52} />
            ) : phase === 'ready' ? (
              <View>
                {/* Holds the figure's room; the phone's own figure is drawn over it, as on Today. */}
                <View style={{ opacity: 0 }}>{own}</View>
                <TodayTotal settings={settings} now={now} fallback={own} style={styles.partPhone} />
              </View>
            ) : (
              own
            )}
            <Text numberOfLines={1} style={styles.countsLine}>
              {reading ? 'Reading\u2026' : `used today of ${durationLabel(settings.goalMinutes)}`}
            </Text>
            <Text numberOfLines={1} style={styles.countsNote}>
              {since}
            </Text>
          </View>
          <View style={styles.theirs}>
            <Text numberOfLines={1} style={styles.countsName}>
              iPhone tracks
            </Text>
            <View style={styles.theirFigure}>
              <WholeTotal settings={settings} now={now} fallback={<WaitingDots size={6} height={WHOLE.height} />} />
            </View>
            <Text style={[styles.countsNote, { textAlign: 'right', marginTop: 21 }]}>{everything}</Text>
          </View>
        </View>
        <EssentialsDock kept={essentials.ready ? essentials.kept : 0} picks={essentials.picks} />
        {phase === 'reading' ? <ReadingBar colour={accent} /> : null}
        {phase === 'reading' ? (
          <Lead>Reading today so far. Nothing locks yet.</Lead>
        ) : phase === 'failed' || over ? null : !essentials.ready ? (
          <Text style={styles.next}>You can pick your essential apps next.</Text>
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
      <ScrollView
        ref={scroller}
        contentContainerStyle={[styles.body_, { paddingTop: bar + UNDER_BAR }, step === 'goal' && figures ? styles.close : null]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}>
        {/* Three places, always in this order, so the figures are never moved (which would draw them again): over them the goal screen's words, and after them, in front, every other screen. */}
        <Fragment key="head">{head}</Fragment>
        {figureBox}
        {body ? (
          <View key="body" style={[styles.screen, figureBox ? styles.cover : null]}>
            {body}
          </View>
        ) : null}
      </ScrollView>
      {/* Over the page, clear until the page is scrolled under it (a small phone): then it takes the ground's colour. */}
      <View style={[styles.top, { height: bar, paddingTop: insets.top + 2 }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.ground, opacity: scrollY.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />
        {at > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => setAt((i) => Math.max(0, i - 1))} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View accessible accessibilityLabel={`Step ${at + 1} of ${STEPS.length}`} style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= at ? styles.dotDone : null]} />
          ))}
        </View>
      </View>
      <View style={[styles.foot, { paddingBottom: footBottom }]}>
        <BigButton tone={full} label={primary.label} onPress={primary.onPress} />
        {secondary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            onPress={() => {
              tap();
              secondary.onPress();
            }}
            style={({ pressed }) => [styles.second, pressed ? { opacity: 0.6 } : null]}>
            <Text style={styles.secondText}>{secondary.label}</Text>
          </Pressable>
        ) : null}
        {quiet ? (
          <Pressable accessibilityRole="button" accessibilityLabel={quiet.label} hitSlop={8} onPress={quiet.onPress} style={styles.quiet}>
            <Text style={styles.quietText}>{quiet.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {/* Until the goal screen's own figures are asked for; never both at once. */}
      {canPick && !figuresShown ? <WakeScreenTime settings={settings} now={now} /> : null}
      {/*
        The wallpaper: a faint light from the top of the page, laid over everything rather than under it. The phone's
        own pictures (the goal screen's figures, parked under the other screens, and the small one that wakes Screen
        Time in the top corner) have the plain ground behind them, and a light under them would show each as a dark
        box; over them, it falls on all alike. It is gone halfway down.
      */}
      <TopLight rgb={WALLPAPER} width={window.width} reach={Math.round(window.height * 0.48)} />
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
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 4 },
  back: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotDone: { backgroundColor: '#FFFFFF' },
  body_: { paddingHorizontal: 24, paddingBottom: 24, gap: 14 },
  // The goal screen on a phone, where the phone's figures and chart share the screen.
  close: { gap: 10, paddingBottom: 10 },
  heading: { fontFamily: display.bold, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, color: c.ink },
  // Setup's last word, as large as Today's.
  giant: { fontFamily: display.bold, fontSize: 64, lineHeight: 68, letterSpacing: -2, marginTop: 2 },
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
  big: { flexShrink: 1, fontFamily: display.bold, fontSize: 76, lineHeight: 80, letterSpacing: -2.8, color: c.ink, fontVariant: ['tabular-nums'], textAlign: 'center' },
  bigClose: { fontSize: 62, lineHeight: 66, letterSpacing: -2.2 },
  figureBox: { gap: 12 },
  figureBoxClose: { gap: 6 },
  figuresHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12 },
  figuresName: { fontFamily: display.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: c.ink },
  figuresNote: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  // A screen's own things, spaced as the scroll view spaces its own.
  screen: { gap: 14 },
  // Out of sight on the other screens, at the same width, so the phone's drawings keep their size and are not redrawn:
  // where the screen in front begins, no taller than its cover.
  parked: { position: 'absolute', left: 24, right: 24, maxHeight: PARKED, overflow: 'hidden' },
  // The screen in front of the parked figures: the ground's colour, and at least as tall as they are.
  cover: { minHeight: PARKED, backgroundColor: c.ground },
  // Setup's last screen: Plainlimit's figure on the left, large; the iPhone's whole day on the right, small and kept to the right, as the phone draws it.
  counts: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  ours: { flex: 1 },
  theirs: { alignItems: 'flex-end' },
  // As tall as the large figure beside it, the small one at its foot.
  theirFigure: { height: 52, justifyContent: 'flex-end', paddingBottom: 6 },
  countsName: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: c.ink3, marginBottom: 2 },
  countsLine: { fontSize: 14, lineHeight: 19, fontWeight: '500', color: c.ink2, marginTop: 2 },
  countsNote: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  // The type of Today's figure, which the phone's exact one is drawn in (targets/report, FigureText): the two must match, one lies over the other.
  partValue: { fontFamily: display.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.6, color: c.ink, fontVariant: ['tabular-nums'], paddingRight: 6 },
  partPhone: { position: 'absolute', left: 0, top: 0, right: 0, height: 52, alignSelf: 'auto' },
  foot: { paddingHorizontal: 24, paddingTop: 8, gap: 6, backgroundColor: c.ground },
  second: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  secondText: { fontSize: 16, fontWeight: '500', color: c.ink2 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 16, color: c.ink2 },
  rowValue: { fontSize: 16, fontWeight: '600', color: c.ink },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  quiet: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontSize: 15, color: c.ink2, textDecorationLine: 'underline' },
});
