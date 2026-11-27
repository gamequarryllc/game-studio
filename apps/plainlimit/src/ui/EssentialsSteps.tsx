import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

import { ESSENTIALS_LIMIT, ESSENTIALS_PICK_ID, essentialsBefore, essentialsChosen, essentialsCount, essentialsJoining, essentialsPicks } from '@/platform/screenTime';
import { store } from '@/state/store';

import { AppIcons } from './AppIcons';
import { AppPicker } from './AppPicker';
import { GlowBattery } from './GlowBattery';
import { CHOOSE_HOW, ESSENTIALS_LOCKED, OTHERS_LABEL, essentialsLabel, joinsLabel, joinsLine, joinsTitle, tooManyKept } from './countWords';
import { Icon } from './icons';
import { BigButton, Card } from './kit';
import { c, display } from './theme';

// Choosing the essentials, shared by its own screen and setup: one button,
// and Apple's list opens once, for the essentials alone. Everything else
// uses the battery without being named: the phone counts everything, less
// the essentials (domain/tally.ts), and locks everything except them. So
// there is nothing to tick but the essentials, a new app counts from its
// first minute, and choosing none at all still counts and locks everything.
// (Up to 1.1's first builds Apple's list opened twice, the first time to
// tick "All Apps & Categories", because the phone could only count apps it
// had been handed by name. The owner got lost in that on a fresh install,
// and App Review skipped it and found a button that did nothing.) The app
// learns how many were picked, never which.
//
// Apple's list works on a copy (ESSENTIALS_PICK_ID): when it closes, the rule
// in domain/essentials.ts decides what starts now and what waits for the
// next recharge. A new essential waits, and shows in a card of its own until
// then ("Joining tomorrow"). The first choice of all starts at once.

/**
 * After Apple's list closes, the picks are read again at these moments, so
 * the icons follow a change without leaving the screen (build 157: a new
 * essential showed only after going back and in again).
 */
const LOOK_AGAIN_MS = [400, 1500];

export type Essentials = {
  /** Essentials ticked. */
  kept: number;
  /** The essentials as Apple's picker handed them over, for iOS to draw their icons (null: none). */
  picks: string | null;
  /** New essentials waiting for the next recharge, for iOS to draw, and how many (null: none wait). */
  joining: { picks: string | null; count: number } | null;
  /** The essentials are chosen (none is a choice too). */
  ready: boolean;
  /** How many were ticked when the last try was turned down for being too many (0: none was). */
  refused: number;
  /** The one button: opens Apple's list on the essentials. */
  start: () => void;
  pickers: ReactNode;
};

/** `onChosen`: called once the essentials are saved (setup moves on by itself). */
export function useEssentials(onChosen?: () => void): Essentials {
  // Read from the phone afresh on every drawing. The React Compiler would
  // otherwise keep the first answers for as long as the screen is up: a
  // change of essentials showed only after leaving the screen and coming
  // back (build 157), and the timers below redrew the same old figures.
  'use no memo';
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState(0);
  // Bumped to draw again with the picks as the phone has them now.
  const [, setLook] = useState(0);
  const looks = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lookAgain = () => {
    looks.current.forEach(clearTimeout);
    looks.current = LOOK_AGAIN_MS.map((ms) => setTimeout(() => setLook((n) => n + 1), ms));
  };
  useEffect(() => () => looks.current.forEach(clearTimeout), []);
  const pickers = (
    <AppPicker
      id={ESSENTIALS_PICK_ID}
      wholeCategories
      open={open}
      header={`Tick your essential apps (up to ${ESSENTIALS_LIMIT}), then ✓ at the top right. Everything else uses your battery.`}
      onClose={() => {
        setOpen(false);
        const tooMany = store.essentialsClosed();
        lookAgain();
        setRefused(tooMany);
        if (tooMany === 0 && essentialsChosen()) onChosen?.();
      }}
    />
  );
  return {
    kept: essentialsCount(),
    picks: essentialsPicks(),
    joining: essentialsJoining(),
    ready: essentialsChosen(),
    refused,
    start: () => {
      if (open) return;
      setRefused(0);
      essentialsBefore();
      setOpen(true);
    },
    pickers,
  };
}

/** When essentials that wait start: the day ("today", "tomorrow", a weekday) and the time of that recharge. */
export type JoinsWhen = { day: string; recharge: string };

/**
 * The card. `locked`: the battery is empty, so the essentials can't change (a
 * way round the lock). `mainInFoot`: the screen has its own big button
 * (setup), so only "change" buttons are drawn here, and quietly. `when`: when
 * new essentials that wait start (setup has none: there every change is at once).
 */
export function EssentialsSteps({ e, locked = false, mainInFoot = false, when = null }: { e: Essentials; locked?: boolean; mainInFoot?: boolean; when?: JoinsWhen | null }) {
  if (e.ready) return <Chosen e={e} locked={locked} quiet={mainInFoot} when={when} />;
  return (
    <Card style={{ paddingVertical: 18, gap: 10 }}>
      <Pictures />
      <Warnings e={e} />
      {mainInFoot ? null : <BigButton label="Choose essentials" onPress={e.start} />}
    </Card>
  );
}

function Warnings({ e }: { e: Essentials }) {
  return e.refused > 0 ? (
    <Text accessibilityRole="alert" style={warn}>
      {tooManyKept(e.refused, ESSENTIALS_LIMIT)}
    </Text>
  ) : null;
}

/** The most essentials drawn: four rows of six, the last one "+N" when there are more. */
const MOST_ICONS = 24;
/** New essentials that wait get two rows at most. */
const JOINING_ICONS = 12;

/**
 * The essentials once chosen, as two cards: the essentials as their own
 * icons beside a full battery ("Never counted"), and everything else beside
 * a draining one ("Uses your battery"). The owner found the sentences that
 * stood here ("18 essentials stay free. Everything else counts…") boring and
 * wordy (2026-11-25), and picked this from three drafts. The second card has
 * no icons and no number: the phone counts everything else without telling
 * the app which apps those are. Under them, one button to change the essentials.
 *
 * Between the two, while new essentials wait for the next recharge
 * (domain/essentials.ts): a card in outline with their icons, "Joining
 * tomorrow", and that they are counted until then.
 */
function Chosen({ e, locked, quiet, when }: { e: Essentials; locked: boolean; quiet: boolean; when: JoinsWhen | null }) {
  const joining = when && e.joining && e.joining.count > 0 ? e.joining : null;
  return (
    <View style={{ gap: 12 }}>
      <View style={glow.free}>
        <View accessible accessibilityLabel={essentialsLabel(e.kept)} style={glow.head}>
          <Text style={glow.name}>Always open</Text>
          <View style={glow.pillFree}>
            <Text style={glow.pillFreeText}>{appsWord(e.kept)}</Text>
          </View>
        </View>
        {e.kept > 0 ? <AppIcons selection={e.picks} count={e.kept} limit={MOST_ICONS} label="Your essential apps" /> : null}
        <View style={glow.foot}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={glow.battery}>
            <GlowBattery cells={6} color={FREE} height={26} />
          </View>
          <Text style={[glow.footText, { color: FREE }]}>Never counted</Text>
        </View>
      </View>
      {joining && when ? (
        <View style={glow.joins}>
          <View accessible accessibilityLabel={joinsLabel(joining.count, when.day, when.recharge)} style={glow.head}>
            <Text style={glow.name}>{joinsTitle(when.day, when.recharge)}</Text>
            <View style={glow.pillJoins}>
              <Text style={glow.pillJoinsText}>{appsWord(joining.count)}</Text>
            </View>
          </View>
          <AppIcons selection={joining.picks} count={joining.count} limit={JOINING_ICONS} label="The apps that become essentials" />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={glow.foot}>
            <Icon name="recharge" size={18} color={c.ink3} />
            <Text style={[glow.footText, { color: c.ink2 }]}>{joinsLine(when.day, when.recharge)}</Text>
          </View>
        </View>
      ) : null}
      <View style={glow.rest}>
        <View accessible accessibilityLabel={OTHERS_LABEL} style={glow.head}>
          <Text style={[glow.name, { color: c.ink2 }]}>Everything else</Text>
        </View>
        <View style={glow.foot}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={glow.battery}>
            <GlowBattery cells={2} color={DRAINING} height={26} />
          </View>
          <Text style={[glow.footText, { color: c.ink2 }]}>Uses your battery</Text>
        </View>
      </View>
      <Warnings e={e} />
      {locked ? (
        <View style={glow.locked}>
          <Icon name="lock" size={17} color={c.ink3} />
          <Text style={glow.lockedText}>{ESSENTIALS_LOCKED}</Text>
        </View>
      ) : (
        <View style={{ marginTop: 6 }}>
          <BigButton quiet={quiet} label="Change essentials" onPress={e.start} />
        </View>
      )}
    </View>
  );
}

function appsWord(n: number): string {
  return n === 1 ? '1 app' : `${n} apps`;
}

/** The green of the essentials: they never use up the battery. */
const FREE = '#57E389';
/** The battery with two cells left, as Today draws it. */
const DRAINING = '#E5CC1C';

const glow = {
  free: { borderRadius: 26, backgroundColor: '#13201A', borderWidth: 1, borderColor: 'rgba(87,227,137,0.38)', padding: 18, gap: 16, shadowColor: '#46CC70', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } },
  rest: { borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, padding: 18, gap: 14 },
  // In outline, like the day a waiting goal starts on in Settings: not in force yet.
  joins: { borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(87,227,137,0.5)', padding: 18, gap: 14 },
  pillJoins: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(87,227,137,0.6)', paddingHorizontal: 10, paddingVertical: 2 },
  pillJoinsText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: FREE },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flexShrink: 1, fontFamily: display.bold, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: c.ink },
  pillFree: { borderRadius: 12, backgroundColor: FREE, paddingHorizontal: 10, paddingVertical: 3 },
  pillFreeText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: c.onTone },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  battery: { width: 96 },
  footText: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  locked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  lockedText: { fontSize: 15, lineHeight: 21, color: c.ink2 },
} as const;

/**
 * Apple's list in a few words and a small picture: few people read a
 * paragraph in setup (the owner, build 107). A handful of example essentials,
 * then Apple's round ✓ at the top right of its list ("Done" before iOS 26).
 * Read out as one sentence.
 */
function Pictures() {
  return (
    <View accessible accessibilityLabel={CHOOSE_HOW} style={{ gap: 14 }}>
      <Text style={pic.title}>Tick what stays open</Text>
      <View style={pic.chips}>
        {EXAMPLES.map((x) => (
          <View key={x.name} style={pic.chip}>
            <View style={[pic.icon, { backgroundColor: x.bg }]}>
              <SymbolView name={x.symbol} size={15} tintColor={x.fg} type="monochrome" fallback={<View style={[pic.dot, { backgroundColor: x.fg }]} />} />
            </View>
            <Text style={pic.chipText}>{x.name}</Text>
          </View>
        ))}
      </View>
      <View style={pic.rule} />
      <View style={pic.allRow}>
        <Text style={pic.thenText}>Then tap</Text>
        {/* Apple's round blue ✓ at the top right of its list (iOS 26; "Done" before). */}
        <View style={pic.doneMark}>
          <Text style={pic.doneTick}>✓</Text>
        </View>
        <Text style={[pic.thenText, { flex: 1 }]}>at the top</Text>
      </View>
      <Text style={pic.restText}>Everything else uses your battery</Text>
    </View>
  );
}

/** Apps people often keep open, as examples: plain symbols, not the apps' own icons. */
const EXAMPLES: { name: string; symbol: SymbolViewProps['name']; bg: string; fg: string }[] = [
  { name: 'Messages', symbol: 'message.fill', bg: '#34C759', fg: '#FFFFFF' },
  { name: 'Phone', symbol: 'phone.fill', bg: '#34C759', fg: '#FFFFFF' },
  { name: 'Maps', symbol: 'mappin', bg: '#E4F2DE', fg: '#F0483E' },
  { name: 'Bank', symbol: 'building.columns.fill', bg: '#2F74EB', fg: '#FFFFFF' },
  { name: 'Codes', symbol: 'key.fill', bg: '#3F4246', fg: '#FFFFFF' },
  { name: 'Music', symbol: 'music.note', bg: '#F5405E', fg: '#FFFFFF' },
];

/** The blue of the ✓ in Apple's list. */
const APPLE_BLUE = '#0A84FF';

const pic = {
  title: { fontFamily: display.bold, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: c.ink },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thenText: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.ink },
  restText: { fontSize: 15, lineHeight: 20, color: c.ink3 },
  rule: { height: 1, backgroundColor: c.rule },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, backgroundColor: c.raised, paddingLeft: 5, paddingRight: 12 },
  chipText: { fontSize: 15, fontWeight: '500', color: c.ink },
  icon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  doneMark: { width: 32, height: 32, borderRadius: 16, backgroundColor: APPLE_BLUE, alignItems: 'center', justifyContent: 'center' },
  doneTick: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: '#FFFFFF' },
} as const;

const warn = { fontSize: 15, lineHeight: 21, color: '#F79200' } as const;
