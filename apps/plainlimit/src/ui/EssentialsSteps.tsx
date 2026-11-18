import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ALL_ID, ESSENTIALS_ID, ESSENTIALS_LIMIT, appsBefore, appsShown, essentialsBefore, essentialsCount, essentialsMode } from '@/platform/screenTime';
import { store } from '@/state/store';

import { AppPicker } from './AppPicker';
import { KEEP_TITLE, SHOW_HOW, SHOW_TITLE, keepHow, keptWords, shownWords, tooManyKept } from './countWords';
import { BigButton, Card } from './kit';
import { c } from './theme';

// The two steps of Essentials, shared by its own screen and setup:
// 1. the phone shows Plainlimit its apps (Apple's list, everything ticked);
// 2. the person ticks only their essentials.
// Both open Apple's own list; the app learns how many were picked, never which.

export type Essentials = {
  /** Apps the phone has shown (0: step 1 not done). */
  shown: number;
  /** Essentials ticked. */
  kept: number;
  /** Both steps done. */
  ready: boolean;
  /** How many were ticked when the last try was turned down for being too many (0: none was). */
  refused: number;
  showApps: () => void;
  choose: () => void;
  /** Apple's lists; draw once, anywhere on the screen. */
  pickers: ReactNode;
};

export function useEssentials(): Essentials {
  const [open, setOpen] = useState<'apps' | 'keep' | null>(null);
  const [refused, setRefused] = useState(0);
  const pickers = (
    <>
      <AppPicker
        id={ALL_ID}
        wholeCategories
        open={open === 'apps'}
        header="Tap All Apps & Categories, then Done"
        onClose={() => {
          setOpen(null);
          store.appsShownClosed();
        }}
      />
      <AppPicker
        id={ESSENTIALS_ID}
        wholeCategories
        open={open === 'keep'}
        header="Tick only your essentials"
        onClose={() => {
          setOpen(null);
          setRefused(store.essentialsClosed());
        }}
      />
    </>
  );
  return {
    shown: appsShown(),
    kept: essentialsCount(),
    ready: essentialsMode(),
    refused,
    showApps: () => {
      appsBefore();
      setOpen('apps');
    },
    choose: () => {
      setRefused(0);
      essentialsBefore();
      setOpen('keep');
    },
    pickers,
  };
}

/**
 * The two steps as cards. `locked`: the battery is empty, so the essentials
 * can't change (a way round the lock). `mainInFoot`: the screen has its own
 * big button for the step that comes next (setup), so only "change" buttons
 * are drawn here.
 */
export function EssentialsSteps({ e, locked = false, mainInFoot = false }: { e: Essentials; locked?: boolean; mainInFoot?: boolean }) {
  const shownDone = e.shown > 0;
  return (
    <View style={{ gap: 12 }}>
      <Step n="1" title={SHOW_TITLE} done={shownDone}>
        <Text style={how}>{shownDone ? shownWords(e.shown) : SHOW_HOW}</Text>
        {locked ? null : shownDone ? <BigButton quiet label="Refresh the app list" onPress={e.showApps} /> : mainInFoot ? null : <BigButton label="Show my apps" onPress={e.showApps} />}
      </Step>
      <Step n="2" title={KEEP_TITLE} done={e.ready}>
        <Text style={how}>{e.ready ? keptWords(e.kept) : keepHow(ESSENTIALS_LIMIT)}</Text>
        {e.refused > 0 ? (
          <Text accessibilityRole="alert" style={{ fontSize: 15, lineHeight: 21, color: '#F79200' }}>
            {tooManyKept(e.refused, ESSENTIALS_LIMIT)}
          </Text>
        ) : null}
        {locked ? null : e.ready ? (
          <BigButton quiet label="Change essentials" onPress={e.choose} />
        ) : mainInFoot ? null : (
          <BigButton label="Choose essentials" disabled={!shownDone} onPress={e.choose} />
        )}
      </Step>
    </View>
  );
}

const how = { fontSize: 15, lineHeight: 21, color: c.ink2 } as const;

function Step({ n, title, done, children }: { n: string; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card style={{ paddingVertical: 14, gap: 10 }}>
      <View accessible accessibilityLabel={`Step ${n}, ${title}${done ? ', done' : ''}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}>
        <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '700', color: c.ink3, width: 12 }}>{done ? '✓' : n}</Text>
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '600', color: c.ink }}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}
