import { useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ALL_ID, ESSENTIALS_ID, ESSENTIALS_LIMIT, appsBefore, appsShown, essentialsBefore, essentialsCount, essentialsMode } from '@/platform/screenTime';
import { store } from '@/state/store';

import { AppPicker } from './AppPicker';
import { CHOOSE_HOW, MISSED_APPS, keptWords, shownWords, tooManyKept } from './countWords';
import { BigButton, Card } from './kit';
import { c } from './theme';

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
        header="Step 1 of 2: tap All Apps & Categories, then Done"
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
        header={`Step 2 of 2: tick only the apps that stay open (up to ${ESSENTIALS_LIMIT}), then Done`}
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
    <Card style={{ paddingVertical: 14, gap: 10 }}>
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
 * What the two lists will look like, as pictures: few people read a paragraph
 * in setup (the owner, build 107). Read out as one sentence.
 */
function Pictures({ firstDone }: { firstDone: boolean }) {
  return (
    <View accessible accessibilityLabel={CHOOSE_HOW} style={{ gap: 14 }}>
      <Picture n={firstDone ? '✓' : '1'} title="Tick All Apps, tap Done" faded={firstDone}>
        <Row label="All Apps & Categories" ticked strong />
        <Row label="Social" ticked />
        <Row label="Games" ticked />
      </Picture>
      <Picture n="2" title="Tick only what stays open">
        <Row label="Messages" ticked strong />
        <Row label="Maps" ticked strong />
        <Row label="Games" />
      </Picture>
    </View>
  );
}

/** `faded`: this step is done, so the eye goes to the other one. */
function Picture({ n, title, faded = false, children }: { n: string; title: string; faded?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 8, opacity: faded ? 0.45 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={pic.badge}>
          <Text style={pic.badgeText}>{n}</Text>
        </View>
        <Text style={pic.title}>{title}</Text>
      </View>
      <View style={pic.list}>{children}</View>
    </View>
  );
}

/** A row of Apple's list: its round tick box, then the name. */
function Row({ label, ticked = false, strong = false }: { label: string; ticked?: boolean; strong?: boolean }) {
  return (
    <View style={pic.row}>
      <View style={[pic.box, ticked ? pic.boxOn : null]}>{ticked ? <Text style={pic.tick}>✓</Text> : null}</View>
      <Text style={[pic.label, strong ? { color: c.ink, fontWeight: '600' } : null]}>{label}</Text>
    </View>
  );
}

/** The blue of the tick boxes in Apple's list. */
const APPLE_BLUE = '#0A84FF';

const pic = {
  badge: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 15, fontWeight: '700', color: c.onPaper },
  title: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  list: { borderRadius: 14, backgroundColor: c.raised, paddingVertical: 4, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 },
  box: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.outline, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: APPLE_BLUE, borderColor: APPLE_BLUE },
  tick: { fontSize: 12, lineHeight: 15, fontWeight: '800', color: '#FFFFFF' },
  label: { fontSize: 15, color: c.ink3 },
} as const;

const how = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;
const warn = { fontSize: 15, lineHeight: 21, color: '#F79200' } as const;
