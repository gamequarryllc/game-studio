import { useRef, useState, type ReactNode } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

import { ALL_ID, ESSENTIALS_ID, ESSENTIALS_LIMIT, appsBefore, appsShown, essentialsBefore, essentialsCount, essentialsMode } from '@/platform/screenTime';
import { store } from '@/state/store';

import { AppPicker } from './AppPicker';
import { CHOOSE_HOW, MISSED_APPS, keptWords, shownWords, tooManyKept } from './countWords';
import { BigButton, Card } from './kit';
import { c, display } from './theme';

// Choosing the essentials, shared by its own screen and setup. To the person
// it is one button. Behind it Apple's list opens twice, one straight after
// the other:
// 1. the phone shows Plainlimit its apps (everything ticked, then Done);
// 2. the person ticks only their essentials.
// iOS never tells an app what is installed, and can only count apps it has
// been handed by name, so the first list can't be left out. Each list says at
// its top what to tap. (Builds 90 to 95 drew the two as numbered cards with a
// button each and a trip back to the screen in between; the owner got lost in
// it on a fresh install.) The app learns how many were picked, never which.

/** The pause between Apple's two lists: the first sheet has to be gone before the second can come up. */
const BETWEEN_MS = 300;

export type Essentials = {
  /** Apps the phone has shown (0: not yet). */
  shown: number;
  /** Essentials ticked. */
  kept: number;
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
  const [open, setOpen] = useState<'apps' | 'keep' | null>(null);
  const [refused, setRefused] = useState(0);
  const [missed, setMissed] = useState(false);
  const chain = useRef(false);
  const [busy, setBusy] = useState(false);
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
        id={ALL_ID}
        wholeCategories
        open={open === 'apps'}
        header="Step 1 of 2 (one-time setup): tap All Apps & Categories, then Done"
        onClose={() => {
          setOpen(null);
          store.appsShownClosed();
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
        id={ESSENTIALS_ID}
        wholeCategories
        open={open === 'keep'}
        header={`Step 2 of 2: tick only your essential apps (up to ${ESSENTIALS_LIMIT}), then Done. They are never counted or locked.`}
        onClose={() => {
          setOpen(null);
          const tooMany = store.essentialsClosed();
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

/**
 * The card. `locked`: the battery is empty, so the essentials can't change (a
 * way round the lock). `mainInFoot`: the screen has its own big button
 * (setup), so only "change" buttons are drawn here.
 */
export function EssentialsSteps({ e, locked = false, mainInFoot = false }: { e: Essentials; locked?: boolean; mainInFoot?: boolean }) {
  return (
    <Card style={{ paddingVertical: e.ready ? 14 : 18, gap: 10 }}>
      {e.ready ? <Text style={how}>{`${keptWords(e.kept)} ${shownWords(e.shown)}`}</Text> : <Pictures firstDone={e.shown > 0} />}
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
      {locked ? null : e.ready ? (
        <View style={{ gap: 10 }}>
          <BigButton quiet label="Change essentials" onPress={e.start} />
          <BigButton quiet label="Refresh the app list" onPress={e.showApps} />
        </View>
      ) : mainInFoot ? null : (
        <BigButton label={e.busy ? 'One moment…' : 'Choose essentials'} disabled={e.busy} onPress={e.start} />
      )}
    </Card>
  );
}

/**
 * The two lists in a few words and two small pictures: few people read a
 * paragraph in setup (the owner, build 107), and the owner picked this
 * shorter card from five drafts (build 115). Step 1 is Apple's top row and
 * its Done button; step 2 is a handful of example essentials. Read out as one
 * sentence.
 */
function Pictures({ firstDone }: { firstDone: boolean }) {
  return (
    <View accessible accessibilityLabel={CHOOSE_HOW} style={{ gap: 16 }}>
      <Step n={firstDone ? '✓' : '1'} title="Tick All, then Done" faded={firstDone}>
        <View style={pic.allRow}>
          <View style={pic.pill}>
            <Tick />
            <Text style={pic.pillText}>All Apps</Text>
          </View>
          <Text style={pic.then}>›</Text>
          <View style={pic.pill}>
            <Text style={[pic.pillText, { color: APPLE_BLUE }]}>Done</Text>
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
  tick: { fontSize: 12, lineHeight: 15, fontWeight: '800', color: '#FFFFFF' },
} as const;

const how = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;
const warn = { fontSize: 15, lineHeight: 21, color: '#F79200' } as const;
