import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CELLS } from '@/domain/battery';
import { glowForCells } from '@/domain/tone';

import { GlowBattery } from './GlowBattery';
import { Icon, type IconName } from './icons';
import { useReducedMotion } from './motion';
import { c, display } from './theme';

// Setup's story: what a new person is told before anything is asked of them,
// one thing a screen, each as a picture with a line under it.
//   1. What it is: a battery that runs down as apps are used, and locks them
//      when it is empty.
//   2. What is free: the essentials never drain it.
//   3. When it comes back: full again at the recharge time.
// The owner showed setup to a friend and a cousin (build 167), who did not
// see what the app was for, what made it different, or what the recharge
// time was, and asked for this order: "first tell them this, then tell them
// that, then tell them this", clear and not wordy, with the owner's own line
// for the essentials: use your phone, don't abuse it. It was one screen with four
// short lines before (ui/Welcome.tsx, up to build 167), which people tapped
// past. Nothing else is told here: what an empty battery does, sums, passes
// and Pro are met when they matter.
//
// The goal screen's own three small pictures (GoalStory) say the same thing
// once more, with the person's own number in it.

/** The green of the essentials, as on their own screen (EssentialsSteps.tsx): they never use up the battery. */
const FREE = '#57E389';
/** The battery with two cells left, as Today draws it. */
const DRAINING = '#E5CC1C';
/** The morning sun. */
const SUN = '#F5C451';
/** A locked app. */
const LOCKED = '#FF7B6B';

/** How long each cell lasts in the big battery's loop, and how long it rests when empty and when full. */
const STEP_MS = 700;
const REST_MS = 1800;

/**
 * Screen 1's picture: the battery running down cell by cell in the day's
 * colours, locked when it is empty, then full again; under it the same three
 * moments standing still, for anyone who looks for less than a loop. Still
 * (and part used) under Reduce Motion.
 */
export function StoryBattery() {
  const reduced = useReducedMotion();
  const [cells, setCells] = useState(CELLS);
  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setCells((n) => (n === 0 ? CELLS : n - 1)), cells === 0 || cells === CELLS ? REST_MS : STEP_MS);
    return () => clearTimeout(timer);
  }, [cells, reduced]);
  const shown = reduced ? 4 : cells;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="A battery that runs down as apps are used. When it is empty, the apps lock." style={styles.card}>
      <View>
        <GlowBattery cells={shown} color={glowForCells(shown)} height={84} />
        {shown === 0 ? (
          <View pointerEvents="none" style={styles.over}>
            <Icon name="lock" size={34} color={glowForCells(0)} />
          </View>
        ) : null}
      </View>
      <View style={styles.moments}>
        <Moment cells={CELLS} words="Full" />
        <Icon name="arrow" size={15} color={c.outline} />
        <Moment cells={2} words="Running low" />
        <Icon name="arrow" size={15} color={c.outline} />
        <Moment cells={0} words="Apps lock" />
      </View>
    </View>
  );
}

function Moment({ cells, words }: { cells: number; words: string }) {
  const color = glowForCells(cells);
  return (
    <View style={styles.moment}>
      <View style={{ alignSelf: 'stretch' }}>
        <GlowBattery cells={cells} color={color} height={26} />
        {cells === 0 ? (
          <View pointerEvents="none" style={[styles.over, { right: 6 }]}>
            <Icon name="lock" size={13} color={color} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.momentWords}>
        {words}
      </Text>
    </View>
  );
}

/** A made-up app: a white symbol on a coloured square, with its kind under it. Not anyone's real icon. */
function App({ icon, bg, name }: { icon: IconName; bg: string; name: string }) {
  return (
    <View style={styles.app}>
      <View style={[styles.appIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={30} color="#FFFFFF" />
      </View>
      <Text numberOfLines={1} style={styles.appName}>
        {name}
      </Text>
    </View>
  );
}

/**
 * Screen 2's picture: two boxes in the look of the essentials' own screen.
 * The apps a phone is for, which never drain the battery, and everything
 * else, which does. `chosenLater`: the essentials are picked after setup,
 * from Today (false on a phone that already has some).
 *
 * The word "essentials" is ours, and nobody has been told it yet: the screen
 * was titled "Essentials are free" over a box named "Never drain it" and
 * marked FREE up to build 169, and the owner saw two things in it. No one
 * knows what an essential is at this point; and "free" does not say that
 * the time is not counted (the app also says "free" for what is not Pro).
 * So the title says "Your essential apps don't count" (the owner's words,
 * both halves), the box is named for who chooses them, "Apps you pick",
 * beside "Everything else", and the two are marked NOT COUNTED and COUNTED:
 * the word Ready, the goal screen and the essentials' own screen use.
 */
export function StoryEssentials({ chosenLater }: { chosenLater: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      <View accessible accessibilityRole="image" accessibilityLabel="The apps you pick as essential, like Phone, Messages and Maps, are not counted." style={styles.free}>
        <View style={styles.head}>
          <Text style={styles.name}>Apps you pick</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>NOT COUNTED</Text>
          </View>
        </View>
        <View style={styles.apps}>
          <App icon="phone" bg="#34C759" name="Phone" />
          <App icon="message" bg="#2F8BFF" name="Messages" />
          <App icon="map" bg="#12A594" name="Maps" />
        </View>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel="Everything else, like videos, games and social apps, is counted." style={styles.rest}>
        <View style={styles.head}>
          <Text style={styles.name}>Everything else</Text>
          <View style={styles.pillOut}>
            <Text style={[styles.pillText, { color: DRAINING }]}>COUNTED</Text>
          </View>
        </View>
        <View style={styles.apps}>
          <App icon="video" bg="#F0453A" name="Videos" />
          <App icon="game" bg="#8B5CF6" name="Games" />
          <App icon="social" bg="#F2478A" name="Social" />
        </View>
      </View>
      <Text style={styles.motto}>{'Use your phone. Don’t abuse it.'}</Text>
      {chosenLater ? <Text style={styles.after}>You pick them right after setup.</Text> : null}
    </View>
  );
}

/**
 * The essentials on setup's last screen: the story's three made-up apps,
 * small, and "Never counted" in their green. The row lies in the iPhone's
 * box and outside Plainlimit's: the iPhone tracks them, Plainlimit never
 * counts them. (It carried a FREE mark in build 169; see StoryEssentials.)
 */
export function FreeRow() {
  return (
    <View accessible accessibilityLabel="Your essential apps are never counted." style={styles.freeRow}>
      <View style={styles.freeTiles}>
        <SmallApp icon="phone" bg="#34C759" />
        <SmallApp icon="message" bg="#2F8BFF" />
        <SmallApp icon="map" bg="#12A594" />
      </View>
      <View style={styles.freeWords}>
        <Text numberOfLines={1} style={styles.freeName}>
          Your essential apps
        </Text>
        <Text numberOfLines={1} style={styles.freeNote}>
          Never counted
        </Text>
      </View>
    </View>
  );
}

function SmallApp({ icon, bg }: { icon: IconName; bg: string }) {
  return (
    <View style={[styles.smallApp, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color="#FFFFFF" />
    </View>
  );
}

/** Whether a recharge time is in the morning, as the third screen's title says. */
export function inTheMorning(rechargeMinute: number): boolean {
  return rechargeMinute >= 3 * 60 && rechargeMinute < 12 * 60;
}

/** Screen 3's picture: the sun coming up, the recharge time (as the screen says it, "6:00 AM"), and a full battery. */
export function StoryMorning({ recharge, morning }: { recharge: string; morning: boolean }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`At ${recharge} the battery is full again.`} style={[styles.card, { alignItems: 'center', gap: 6 }]}>
      <Icon name="recharge" size={96} color={morning ? SUN : c.ink3} />
      <Text style={styles.time}>{recharge}</Text>
      <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
        <GlowBattery cells={CELLS} color={glowForCells(CELLS)} height={60} />
      </View>
    </View>
  );
}

/**
 * The goal screen's three small pictures, under the number: that much use,
 * then the apps lock, then they are back at the recharge time. The owner's
 * friend asked of "How much a day?": how much what, and what is it for
 * (build 167); the owner picked this from three drafts.
 */
export function GoalStory({ goal, recharge }: { goal: string; recharge: string }) {
  return (
    <View accessible accessibilityLabel={`${goal} of use a day. Then your apps lock, and they are back at ${recharge}.`} style={styles.goal}>
      <GoalStep icon="iphone" colour={FREE} words={`${goal} of use`} />
      <View style={styles.goalArrow}>
        <Icon name="arrow" size={17} color={c.outline} />
      </View>
      <GoalStep icon="lock" colour={LOCKED} words="Apps lock" />
      <View style={styles.goalArrow}>
        <Icon name="arrow" size={17} color={c.outline} />
      </View>
      <GoalStep icon="recharge" colour={SUN} words={`Back at ${recharge}`} />
    </View>
  );
}

function GoalStep({ icon, colour, words }: { icon: IconName; colour: string; words: string }) {
  return (
    <View style={styles.goalStep}>
      <Icon name={icon} size={24} color={colour} />
      <Text numberOfLines={1} style={styles.goalWords}>
        {words}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, paddingVertical: 26, paddingHorizontal: 20, gap: 26 },
  // Over a battery, in its middle (short of the cap on its right end).
  over: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 12, alignItems: 'center', justifyContent: 'center' },
  moments: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  moment: { flex: 1, alignItems: 'center', gap: 8 },
  momentWords: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: c.ink2 },
  free: { borderRadius: 26, backgroundColor: '#13201A', borderWidth: 1.5, borderColor: 'rgba(87,227,137,0.6)', padding: 16, gap: 14 },
  rest: { borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flexShrink: 1, fontFamily: display.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3, color: c.ink },
  pill: { borderRadius: 11, backgroundColor: FREE, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 13, lineHeight: 17, fontWeight: '800', letterSpacing: 1, color: c.onTone },
  // The same mark as an outline, in the draining battery's colour.
  pillOut: { borderRadius: 11, borderWidth: 1.5, borderColor: DRAINING, paddingHorizontal: 9, paddingVertical: 1.5 },
  apps: { flexDirection: 'row' },
  app: { flex: 1, alignItems: 'center', gap: 7 },
  appIcon: { width: 58, height: 58, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  appName: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: c.ink2 },
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  freeTiles: { flexDirection: 'row', gap: 6 },
  smallApp: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  freeWords: { flex: 1 },
  freeName: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: c.ink },
  freeNote: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: FREE, marginTop: 2 },
  motto: { marginTop: 8, fontFamily: display.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: c.ink },
  after: { fontSize: 15, lineHeight: 21, color: c.ink3, marginTop: -6 },
  time: { fontFamily: display.bold, fontSize: 52, lineHeight: 56, letterSpacing: -1.6, color: c.ink },
  // Each step as wide as its words, so the longest ("Back at 12:00 PM") stays on one line.
  goal: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 6 },
  goalStep: { alignItems: 'center', gap: 5 },
  goalArrow: { paddingTop: 3 },
  goalWords: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: c.ink2, textAlign: 'center' },
});
