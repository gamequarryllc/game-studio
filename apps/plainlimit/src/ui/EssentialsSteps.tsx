import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/platform/haptics';
import { ALL_PICK_ID, ESSENTIALS_LIMIT, ESSENTIALS_PICK_ID, allPicks, appsBefore, appsShown, countedAppsCount, essentialsBefore, essentialsCount, essentialsJoining, essentialsMode, essentialsPicks } from '@/platform/screenTime';
import { store } from '@/state/store';

import { AppIcons } from './AppIcons';
import { AppPicker } from './AppPicker';
import { GlowBattery } from './GlowBattery';
import { CHOOSE_HOW, ESSENTIALS_LOCKED, MISSED_APPS, essentialsLabel, joinsLabel, joinsLine, joinsTitle, othersLabel, tooManyKept } from './countWords';
import { Icon } from './icons';
import { BigButton, Card } from './kit';
import { c, display } from './theme';

// Choosing the essentials, shared by its own screen and setup. To the person
// it is one button. Behind it Apple's list opens twice, one straight after
// the other:
// 1. the phone shows Plainlimit its apps (everything ticked, then ✓);
// 2. the person ticks only their essentials.
// iOS never tells an app what is installed, and can only count apps it has
// been handed by name, so the first list can't be left out. Each list says at
// its top what to tap. (Builds 90 to 95 drew the two as numbered cards with a
// button each and a trip back to the screen in between; the owner got lost in
// it on a fresh install.) The app learns how many were picked, never which.
//
// Apple's lists work on copies (ALL_PICK_ID, ESSENTIALS_PICK_ID): when one
// closes, the rule in domain/essentials.ts decides what starts now and what
// waits for the next recharge. A new essential waits, and shows in a card of
// its own until then ("Joining tomorrow").

/** The pause between Apple's two lists: the first sheet has to be gone before the second can come up. */
const BETWEEN_MS = 300;
/**
 * After Apple's list closes, the picks are read again at these moments, so
 * the icons follow a change without leaving the screen (build 157: a new
 * essential showed only after going back and in again).
 */
const LOOK_AGAIN_MS = [400, 1500];

export type Essentials = {
  /** Apps the phone has shown (0: not yet). */
  shown: number;
  /** Essentials ticked. */
  kept: number;
  /** The essentials as Apple's picker handed them over, for iOS to draw their icons (null: none). */
  picks: string | null;
  /** Every app shown, the same way: less the essentials, the apps that use the battery. */
  allPicks: string | null;
  /** How many apps use the battery. */
  others: number;
  /** New essentials waiting for the next recharge, for iOS to draw, and how many (null: none wait). */
  joining: { picks: string | null; count: number } | null;
  /** The essentials are chosen. */
  ready: boolean;
  /** How many were ticked when the last try was turned down for being too many (0: none was). */
  refused: number;
  /** The first list was closed with nothing ticked. */
  missed: boolean;
  /** Between the two lists: the second is on its way, so the button waits. */
  busy: boolean;
  /** The one button: shows the apps if they haven't been, then the essentials. */
  start: () => void;
  /** Only the first list again, for apps installed since. */
  showApps: () => void;
  pickers: ReactNode;
};

/** `onChosen`: called once the essentials are saved (setup moves on by itself). */
export function useEssentials(onChosen?: () => void): Essentials {
  // Read from the phone afresh on every drawing. The React Compiler would
  // otherwise keep the first answers for as long as the screen is up: a
  // change of essentials showed only after leaving the screen and coming
  // back (build 157), and the timers below redrew the same old figures.
  'use no memo';
  const [open, setOpen] = useState<'apps' | 'keep' | null>(null);
  const [refused, setRefused] = useState(0);
  const [missed, setMissed] = useState(false);
  const chain = useRef(false);
  const [busy, setBusy] = useState(false);
  // Bumped to draw again with the picks as the phone has them now.
  const [, setLook] = useState(0);
  const looks = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lookAgain = () => {
    looks.current.forEach(clearTimeout);
    looks.current = LOOK_AGAIN_MS.map((ms) => setTimeout(() => setLook((n) => n + 1), ms));
  };
  useEffect(() => () => looks.current.forEach(clearTimeout), []);
  const choose = () => {
    setBusy(false);
    setRefused(0);
    setMissed(false);
    essentialsBefore();
    setOpen('keep');
  };
  const pickers = (
    <>
      <AppPicker
        id={ALL_PICK_ID}
        wholeCategories
        open={open === 'apps'}
        header={`Step 1 of 2 (one-time setup): tick All Apps & Categories, then ✓ at the top right.`}
        onClose={() => {
          setOpen(null);
          store.appsShownClosed();
          lookAgain();
          const then = chain.current;
          chain.current = false;
          if (appsShown() === 0) setMissed(true);
          else if (then) {
            setBusy(true);
            setTimeout(choose, BETWEEN_MS);
          }
        }}
      />
      <AppPicker
        id={ESSENTIALS_PICK_ID}
        wholeCategories
        open={open === 'keep'}
        header={`Step 2 of 2: tick your essential apps (up to ${ESSENTIALS_LIMIT}), then ✓ at the top right.`}
        onClose={() => {
          setOpen(null);
          const tooMany = store.essentialsClosed();
          lookAgain();
          setRefused(tooMany);
          if (tooMany === 0 && essentialsMode()) onChosen?.();
        }}
      />
    </>
  );
  const showApps = () => {
    setMissed(false);
    appsBefore();
    setOpen('apps');
  };
  return {
    shown: appsShown(),
    kept: essentialsCount(),
    picks: essentialsPicks(),
    allPicks: allPicks(),
    others: countedAppsCount(),
    joining: essentialsJoining(),
    ready: essentialsMode(),
    refused,
    missed,
    busy,
    start: () => {
      if (busy || open !== null) return;
      if (appsShown() > 0) return choose();
      chain.current = true;
      showApps();
    },
    showApps,
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
      <Pictures firstDone={e.shown > 0} />
      <Warnings e={e} />
      {mainInFoot ? null : <BigButton label={e.busy ? 'One moment…' : 'Choose essentials'} disabled={e.busy} onPress={e.start} />}
    </Card>
  );
}

function Warnings({ e }: { e: Essentials }) {
  return (
    <>
      {e.missed ? (
        <Text accessibilityRole="alert" style={warn}>
          {MISSED_APPS}
        </Text>
      ) : null}
      {e.refused > 0 ? (
        <Text accessibilityRole="alert" style={warn}>
          {tooManyKept(e.refused, ESSENTIALS_LIMIT)}
        </Text>
      ) : null}
    </>
  );
}

/** The most essentials drawn: four rows of six, the last one "+N" when there are more. */
const MOST_ICONS = 24;
/** New essentials that wait get two rows at most. */
const JOINING_ICONS = 12;
/** The apps that use the battery get one row. */
const OTHER_ICONS = 6;

/**
 * The essentials once chosen, as two cards: the essentials as their own
 * icons beside a full battery ("Never counted"), and every other app, grey,
 * beside a draining one ("Uses your battery"). The owner found the sentences
 * that stood here ("18 essentials stay free. Everything else counts…") boring
 * and wordy (2026-11-25), and picked this from three drafts. Under them, one
 * button to change the essentials, and a small link for apps installed since.
 *
 * Between the two, while new essentials wait for the next recharge
 * (domain/essentials.ts): a card in outline with their icons, "Joining
 * tomorrow", and that they are counted until then. They are still among
 * "Everything else" today.
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
        <View accessible accessibilityLabel={othersLabel(e.others)} style={glow.head}>
          <Text style={[glow.name, { color: c.ink2 }]}>Everything else</Text>
          <View style={glow.pillRest}>
            <Text style={glow.pillRestText}>{appsWord(e.others)}</Text>
          </View>
        </View>
        {e.others > 0 ? <AppIcons selection={e.allPicks} minus={e.picks} dim count={e.others} limit={OTHER_ICONS} label="The apps that use your battery" /> : null}
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
        <View style={{ gap: 4, marginTop: 6 }}>
          <BigButton quiet={quiet} label="Change essentials" onPress={e.start} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh the app list"
            accessibilityHint="For apps installed since"
            hitSlop={8}
            onPress={() => {
              tap();
              e.showApps();
            }}
            style={({ pressed }) => [glow.refresh, pressed ? { opacity: 0.6 } : null]}>
            <Icon name="refresh" size={16} color={c.ink3} />
            <Text style={glow.refreshText}>
              New app? <Text style={{ color: c.ink, fontWeight: '600' }}>Refresh list</Text>
            </Text>
          </Pressable>
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
  pillRest: { borderRadius: 12, backgroundColor: c.raised, paddingHorizontal: 10, paddingVertical: 3 },
  pillRestText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: c.ink2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  battery: { width: 96 },
  footText: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  locked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  lockedText: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44 },
  refreshText: { fontSize: 15, lineHeight: 20, color: c.ink3 },
} as const;

/**
 * The two lists in a few words and two small pictures: few people read a
 * paragraph in setup (the owner, build 107), and the owner picked this
 * shorter card from five drafts (build 115). Step 1 is Apple's top row and
 * its ✓ button ("Done" before iOS 26); step 2 is a handful of example essentials. Read out as one
 * sentence.
 */
function Pictures({ firstDone }: { firstDone: boolean }) {
  return (
    <View accessible accessibilityLabel={CHOOSE_HOW} style={{ gap: 16 }}>
      <Step n={firstDone ? '✓' : '1'} title="Tick All, then ✓" faded={firstDone}>
        <View style={pic.allRow}>
          <View style={pic.pill}>
            <Tick />
            <Text style={pic.pillText}>All Apps</Text>
          </View>
          <Text style={pic.then}>›</Text>
          {/* Apple's round blue ✓ at the top right of its list (iOS 26; "Done" before). */}
          <View style={pic.doneMark}>
            <Text style={pic.doneTick}>✓</Text>
          </View>
        </View>
      </Step>
      <View style={pic.rule} />
      <Step n="2" title="Tick what stays open">
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
      </Step>
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

/** `faded`: this step is done, so the eye goes to the other one. */
function Step({ n, title, faded = false, children }: { n: string; title: string; faded?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 12, opacity: faded ? 0.45 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={pic.badge}>
          <Text style={pic.badgeText}>{n}</Text>
        </View>
        <Text style={pic.title}>{title}</Text>
      </View>
      <View style={{ paddingLeft: 42 }}>{children}</View>
    </View>
  );
}

/** The round tick box of Apple's list, ticked. */
function Tick() {
  return (
    <View style={pic.box}>
      <Text style={pic.tick}>✓</Text>
    </View>
  );
}

/** The blue of the tick boxes in Apple's list. */
const APPLE_BLUE = '#0A84FF';

const pic = {
  badge: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: display.bold, fontSize: 17, color: c.onPaper },
  title: { flex: 1, fontFamily: display.bold, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: c.ink },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 12, backgroundColor: c.raised, paddingHorizontal: 12 },
  pillText: { fontSize: 15, fontWeight: '600', color: c.ink },
  then: { fontSize: 22, lineHeight: 24, color: c.ink3 },
  rule: { height: 1, backgroundColor: c.rule },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, backgroundColor: c.raised, paddingLeft: 5, paddingRight: 12 },
  chipText: { fontSize: 15, fontWeight: '500', color: c.ink },
  icon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  box: { width: 20, height: 20, borderRadius: 10, backgroundColor: APPLE_BLUE, alignItems: 'center', justifyContent: 'center' },
  doneMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: APPLE_BLUE, alignItems: 'center', justifyContent: 'center' },
  doneTick: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: '#FFFFFF' },
  tick: { fontSize: 12, lineHeight: 15, fontWeight: '800', color: '#FFFFFF' },
} as const;

const warn = { fontSize: 15, lineHeight: 21, color: '#F79200' } as const;
