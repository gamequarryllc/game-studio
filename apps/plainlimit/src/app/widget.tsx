import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CELLS } from '@/domain/battery';
import { glowForCells } from '@/domain/tone';
import { Card, Lead, Page, ProBadge, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useAccent } from '@/ui/useDay';

// Settings > Add the widget: three pictures of how the battery gets onto the
// Home Screen. An app can't put its own widget there (iOS has no way to), so
// the steps are shown instead, as pictures first and few words (the owner,
// 2026-11-21). The large widget is part of Plainlimit Pro.

export default function AddWidget() {
  const accent = useAccent();
  return (
    <Page top={8}>
      <Title>Add the widget</Title>
      <Lead>Your battery on the Home Screen, without opening the app.</Lead>

      <Step n={1} accent={accent} head="Hold an empty spot" line="On your Home Screen, until the apps wiggle">
        <Phone>
          <Apps wiggle />
          <Touch left={31} top={104} />
        </Phone>
      </Step>

      <Step n={2} accent={accent} head="Tap Edit, then Add Widget" line="Top left corner">
        <Phone>
          <View style={pic.edit}>
            <Text style={pic.editText}>Edit</Text>
          </View>
          <Apps wiggle />
          <Touch left={14} top={8} />
        </Phone>
      </Step>

      <Step
        n={3}
        accent={accent}
        head="Search Plainlimit"
        line={
          <View style={{ gap: 4 }}>
            <Text style={styles.line}>Small and medium are free</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.line}>Large is</Text>
              <ProBadge />
            </View>
          </View>
        }>
        <Phone>
          <View style={pic.search}>
            <Text style={pic.searchText}>Plainlimit</Text>
          </View>
          <MiniWidget />
          <View style={pic.add}>
            <Text style={pic.addText}>Add Widget</Text>
          </View>
        </Phone>
      </Step>
    </Page>
  );
}

function Step({ n, head, line, accent, children }: { n: number; head: string; line: ReactNode; accent: string; children: ReactNode }) {
  return (
    <Card style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {children}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={[styles.number, { backgroundColor: accent }]}>
          <Text style={styles.numberText}>{n}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.head}>
          {head}
        </Text>
        {typeof line === 'string' ? <Text style={styles.line}>{line}</Text> : line}
      </View>
    </Card>
  );
}

/** A small Home Screen to draw on. */
function Phone({ children }: { children: ReactNode }) {
  return <View style={pic.phone}>{children}</View>;
}

/** Two rows of app tiles; with `wiggle` each leans a little, as when the Home Screen is being edited. */
function Apps({ wiggle = false }: { wiggle?: boolean }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <View key={i} style={[pic.app, { left: 10 + (i % 4) * 17, top: 66 + Math.floor(i / 4) * 18 }, wiggle ? { transform: [{ rotate: i % 2 ? '5deg' : '-5deg' }] } : null]} />
      ))}
    </>
  );
}

/** Where the finger goes. */
function Touch({ left, top }: { left: number; top: number }) {
  return (
    <View style={[pic.touchRing, { left: left - 5, top: top - 5 }]}>
      <View style={pic.touch} />
    </View>
  );
}

/** The widget as it looks in Apple's list: a dark tile with the battery's glowing cells. */
function MiniWidget() {
  const glow = glowForCells(4);
  return (
    <View style={pic.widget}>
      {Array.from({ length: CELLS }, (_, i) => (
        <View key={i} style={i < 4 ? [pic.cell, { backgroundColor: glow }] : [pic.cell, pic.cellOff]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  number: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  numberText: { fontFamily: display.bold, fontSize: 15, lineHeight: 19, color: c.onTone },
  head: { fontFamily: display.semi, fontSize: 18, lineHeight: 23, color: c.ink },
  line: { fontSize: 14.5, lineHeight: 19, color: c.ink3 },
});

const pic = StyleSheet.create({
  phone: { width: 84, height: 150, borderRadius: 18, backgroundColor: '#16202B', borderWidth: 2, borderColor: '#3A3E43', overflow: 'hidden' },
  app: { position: 'absolute', width: 13, height: 13, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  touchRing: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  touch: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.4)' },
  edit: { position: 'absolute', left: 8, top: 10, height: 18, paddingHorizontal: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' },
  editText: { fontSize: 9.5, fontWeight: '700', color: c.ink },
  search: { position: 'absolute', left: 8, right: 8, top: 12, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', paddingLeft: 7 },
  searchText: { fontSize: 8.5, fontWeight: '500', color: c.ink2 },
  widget: { position: 'absolute', left: 8, right: 8, top: 40, height: 34, borderRadius: 9, backgroundColor: '#0F1A14', borderWidth: 1, borderColor: '#29402F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  cell: { width: 6, height: 14, borderRadius: 2 },
  cellOff: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  add: { position: 'absolute', left: 12, right: 12, bottom: 14, height: 20, borderRadius: 10, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
});
