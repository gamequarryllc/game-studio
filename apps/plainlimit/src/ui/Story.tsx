import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { CELLS } from '@/domain/battery';
import { glowForCells } from '@/domain/tone';

import { AppIcons } from './AppIcons';
import { BrandApp, FREE, TickedApp, type BrandName } from './BrandApp';
import { GlowBattery, GlowHalo } from './GlowBattery';
import { Icon } from './icons';
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
// The goal screen says the same thing once more in one line, with the
// person's own number in it (app/setup.tsx). Up to build 173 it was three
// small pictures there (GoalStory); the owner found that screen "a lot".

//
// The look (build 173): the owner found build 172's setup "very ai slopped
// looking", every screen the same stack of dark rounded boxes with small
// capital labels, and picked "Home screen" from eight drafts (2026-11-27):
// no boxes, the battery drawn exactly as Today draws it (never a long thin
// one: "I don't like the elongated battery I like the one that looks similar
// to the today page"), and apps that look like real apps (BrandApp.tsx) in
// place of made-up tiles. The essentials sit in a dock, as on a home screen.
// The second screen is laid out as in the "Today" draft, which the owner
// circled for that one page.

/** The battery with two cells left, as Today draws it. */
const DRAINING = '#E5CC1C';
/** The morning sun. */
const SUN = '#F5C451';

/** What eats the day, and what a phone is for: the story's examples. */
const COUNTED: BrandName[] = ['instagram', 'youtube', 'tiktok'];
const ESSENTIAL: BrandName[] = ['phone', 'messages', 'maps'];

/** As wide as a phone's page is taken to be (Today does the same). */
function usePage(): { span: number; inner: number } {
  const span = Math.min(useWindowDimensions().width, 480);
  return { span, inner: span - 48 };
}

/** Today's battery height for a battery `width` wide: 342 across is 128 tall. */
function heightFor(width: number): number {
  return Math.round(Math.min(128, width * 0.375));
}

/**
 * Today's battery, as wide as the page (or `scale` of it, centred), with
 * Today's soft light behind it, gone `reach` points under it. `lock`: the
 * lock an empty battery carries. `first`: a word in the first cell (how long
 * one cell lasts).
 */
export function HeroBattery({ cells, color, lock = false, first, reach = 110, strength = 1, scale = 1 }: { cells: number; color: string; lock?: boolean; first?: string; reach?: number; strength?: number; scale?: number }) {
  const { span, inner } = usePage();
  const width = Math.round(inner * scale);
  const height = Math.round(heightFor(inner) * scale);
  // The first cell's place, as GlowBattery lays its cells out.
  const border = Math.max(3, Math.round(height * 0.06));
  const inset = Math.max(3, Math.round(height * 0.095));
  const gap = Math.max(3, Math.round(height * 0.08));
  const casing = width - Math.max(3, Math.round(height * 0.06)) - Math.max(4, Math.round(height * 0.09));
  const cell = (casing - 2 * border - 2 * inset - 5 * gap) / CELLS;
  return (
    <View style={{ width, height, alignSelf: 'center' }}>
      <GlowHalo color={color} width={width} height={height} span={span} reach={height / 2 + reach} strength={strength} />
      <GlowBattery cells={cells} color={color} height={height} />
      {lock ? <LockOver height={height} color={color} /> : null}
      {first && cells > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: border + inset, width: cell, alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: display.bold, fontSize: Math.round(height * 0.13), letterSpacing: -0.5, color: c.onTone }}>
            {first}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The lock in the middle of an empty battery `height` tall, on a round of the ground so the empty cells don't run through it. */
function LockOver({ height, color }: { height: number; color: string }) {
  const round = Math.round(height * 0.56);
  return (
    <View pointerEvents="none" style={[styles.over, { right: Math.max(3, Math.round(height * 0.06)) + Math.max(4, Math.round(height * 0.09)) }]}>
      <View style={{ width: round, height: round, borderRadius: round / 2, backgroundColor: c.ground, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={Math.round(height * 0.34)} color={color} />
      </View>
    </View>
  );
}

/** The day in three moments, top to bottom: the battery, and the same three apps beside it. */
const MOMENTS: { cells: number; words: string }[] = [
  { cells: CELLS, words: 'Full' },
  { cells: 2, words: 'Running low' },
  { cells: 0, words: 'Apps lock' },
];

/**
 * Screen 1's picture: the day in three rows. A full battery beside three
 * apps; two cells left beside the same three; an empty, locked battery, and
 * the three apps dark under a lock each. So "when it's empty, they lock" is
 * something seen, with apps anyone knows. (Up to build 172 one big battery
 * ran down in a loop over three small ones, in a box.) The rows come in one
 * after the other; all at once under Reduce Motion.
 */
export function StoryBattery() {
  const reduced = useReducedMotion();
  const { inner } = usePage();
  const icon = 52;
  const between = 10;
  // The battery takes what the three apps leave, and keeps Today's shape.
  const batteryWidth = Math.min(160, inner - (3 * icon + 2 * between) - 16);
  const [shown] = useState(() => MOMENTS.map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduced) {
      shown.forEach((v) => v.setValue(1));
      return;
    }
    const run = Animated.stagger(
      170,
      shown.map((v) => Animated.timing(v, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
    );
    run.start();
    return () => run.stop();
  }, [reduced, shown]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="A battery that runs down as apps are used. When it is empty, the apps lock." style={styles.moments}>
      {MOMENTS.map(({ cells, words }, i) => {
        const color = glowForCells(cells);
        return (
          <Animated.View key={words} style={{ gap: 10, opacity: shown[i], transform: [{ translateY: shown[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            <Text style={[styles.momentWords, { color }]}>{words}</Text>
            <View style={styles.momentRow}>
              <View style={{ width: batteryWidth }}>
                <GlowBattery cells={cells} color={color} height={heightFor(batteryWidth)} />
                {cells === 0 ? <LockOver height={heightFor(batteryWidth)} color={color} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: between }}>
                {COUNTED.map((name) => (
                  <BrandApp key={name} name={name} size={icon} state={cells === 0 ? 'locked' : undefined} />
                ))}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Three dots, one under the other: an app drawing on the battery over it. */
function Draw() {
  return (
    <View style={styles.draw}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.drawDot} />
      ))}
    </View>
  );
}

function Kind({ title, colour, note }: { title: string; colour: string; note: string }) {
  return (
    <View style={styles.kind}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.kindTitle, { color: colour }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.kindNote}>
        {note}
      </Text>
    </View>
  );
}

/**
 * Screen 2's picture: Today's battery, part used; hanging from it the apps
 * that draw on it (Instagram, YouTube, TikTok: "Counted"); and under them,
 * joined to nothing and ticked green, the apps a phone is for (Phone,
 * Messages, Maps: "Not counted"). `chosenLater`: the essentials are picked
 * two screens on, once Screen Time is allowed (false on a phone that already
 * has some).
 *
 * The word "essentials" is ours, and nobody has been told it yet: the screen
 * was titled "Essentials are free" over a box named "Never drain it" and
 * marked FREE up to build 169, and the owner saw two things in it. No one
 * knows what an essential is at this point; and "free" does not say that
 * the time is not counted (the app also says "free" for what is not Pro).
 * So the title says "Your essential apps don't count" (the owner's words,
 * both halves), the essentials are named for who chooses them, "Apps you
 * pick", beside "Everything else", and the two are marked "Not counted" and
 * "Counted": the word Ready, the goal screen and the essentials' own screen
 * use. (Two boxes of made-up apps, marked in small capitals, up to build 172.)
 */
export function StoryEssentials({ chosenLater }: { chosenLater: boolean }) {
  const icon = 54;
  const between = 12;
  const some = glowForCells(4);
  return (
    <View>
      <HeroBattery cells={4} color={some} reach={86} strength={0.8} />
      <View accessible accessibilityRole="image" accessibilityLabel="Everything else, like Instagram, YouTube and TikTok, is counted.">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={[styles.apps, { gap: between, marginTop: 5, marginBottom: 5 }]}>
          {COUNTED.map((name) => (
            <View key={name} style={{ width: icon, alignItems: 'center' }}>
              <Draw />
            </View>
          ))}
        </View>
        <View style={[styles.apps, { gap: between }]}>
          {COUNTED.map((name) => (
            <BrandApp key={name} name={name} size={icon} />
          ))}
          <Kind title="Counted" colour={DRAINING} note="Everything else" />
        </View>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel="The apps you pick as essential, like Phone, Messages and Maps, are not counted." style={[styles.apps, { gap: between, marginTop: 30 }]}>
        {ESSENTIAL.map((name) => (
          <TickedApp key={name} name={name} size={icon} />
        ))}
        <Kind title="Not counted" colour={FREE} note="Apps you pick" />
      </View>
      <Text style={styles.motto}>{'Use your phone.\nDon’t abuse it.'}</Text>
      {chosenLater ? <Text style={styles.after}>You pick them in a moment.</Text> : null}
    </View>
  );
}

/**
 * The essentials on setup's last screen, in a dock like the one at the foot
 * of a home screen, under "Never counted" in their green: the iPhone tracks
 * them, Plainlimit never counts them. (The row carried a FREE mark in build
 * 169; see StoryEssentials.)
 *
 * `kept` and `picks`: the essentials chosen two screens back, drawn as their
 * own icons, every one of them, six to a row (AppIcons). Build 170 drew the
 * story's three example apps here whatever had been chosen, and the owner,
 * who had just ticked four others, was shown Phone, Messages and Maps. Up to
 * build 173 it was one row of six, the last one "+N"; the owner, with
 * fifteen picked, saw five and "+10": "the ready screen would be cool if it
 * showed all of them. Like, even if it goes down, we have to scroll." The
 * three examples are for someone who skipped the essentials: a promise.
 */
export function EssentialsDock({ kept = 0, picks = null }: { kept?: number; picks?: string | null }) {
  return (
    <View accessible accessibilityLabel="Your essential apps are never counted." style={{ gap: 10 }}>
      <View style={styles.dockHead}>
        <Text numberOfLines={1} style={styles.dockName}>
          Your essential apps
        </Text>
        <Text numberOfLines={1} style={styles.dockNote}>
          Never counted
        </Text>
      </View>
      <View style={styles.dock}>
        {kept > 0 ? (
          <AppIcons selection={picks} count={kept} columns={6} label="Your essential apps" />
        ) : (
          <View style={styles.dockExamples}>
            {ESSENTIAL.map((name) => (
              <TickedApp key={name} name={name} size={52} ring={DOCK_GROUND} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** The dock's own colour on the ground, for the rings of the ticks that sit on it. */
const DOCK_GROUND = '#262829';

/** Whether a recharge time is in the morning, as the third screen's title says. */
export function inTheMorning(rechargeMinute: number): boolean {
  return rechargeMinute >= 3 * 60 && rechargeMinute < 12 * 60;
}

/** Screen 3's picture: a full battery in Today's light, and under it the sun coming up beside the recharge time (as the screen says it, "6:00 AM"). */
export function StoryMorning({ recharge, morning }: { recharge: string; morning: boolean }) {
  const full = glowForCells(CELLS);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`At ${recharge} the battery is full again.`} style={{ gap: 18 }}>
      <HeroBattery cells={CELLS} color={full} reach={86} strength={0.8} />
      <View style={styles.sunrise}>
        <Icon name="recharge" size={56} color={morning ? SUN : c.ink3} />
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.time, { color: full }]}>
          {recharge}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over a battery, in its middle (short of the cap on its right end).
  over: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  moments: { gap: 24, marginTop: 10 },
  momentWords: { fontFamily: display.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  momentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  apps: { flexDirection: 'row', alignItems: 'center' },
  draw: { height: 20, justifyContent: 'space-between' },
  drawDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: DRAINING },
  kind: { flex: 1, marginLeft: 4, gap: 2 },
  kindTitle: { fontFamily: display.bold, fontSize: 23, lineHeight: 28, letterSpacing: -0.3 },
  kindNote: { fontSize: 15, lineHeight: 20, color: c.ink3 },
  motto: { marginTop: 34, fontFamily: display.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3, color: c.ink },
  after: { fontSize: 15, lineHeight: 21, color: c.ink3, marginTop: 12 },
  dockHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingHorizontal: 4 },
  dockName: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink2 },
  dockNote: { fontFamily: display.bold, fontSize: 18, lineHeight: 22, color: FREE },
  // Like the dock at the foot of a home screen: a soft light bar, round at the ends.
  dock: { borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)', paddingVertical: 16, paddingHorizontal: 18 },
  dockExamples: { flexDirection: 'row', justifyContent: 'center', gap: 30 },
  sunrise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  time: { flexShrink: 1, fontFamily: display.bold, fontSize: 56, lineHeight: 62, letterSpacing: -1.8 },
});
