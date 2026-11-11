import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { plural, type HomeSummary } from '@/domain/selectors';

import { space, type, useTheme } from './theme';

// The manila folder at the top of the Rooms screen: what the household adds
// up to, and how much of it is properly documented.

function Meter({ label, done, total }: { label: string; done: number; total: number }) {
  const { c } = useTheme();
  const ratio = total === 0 ? 0 : done / total;
  return (
    <View accessible accessibilityLabel={`${label}: ${done} of ${total}`} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[type.footnote, { color: c.manilaInk2 }]}>{label}</Text>
        <Text style={[type.footnote, type.tabular, { color: c.manilaInk, fontWeight: '600' }]}>
          {done}
          <Text style={{ color: c.manilaInk2, fontWeight: '400' }}> of {total}</Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.manilaEdge }]}>
        <View style={[styles.fill, { backgroundColor: c.green, width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

export function FolderCard({ label, summary, currency }: { label: string; summary: HomeSummary; currency: string }) {
  const { c } = useTheme();
  const empty = summary.count === 0;
  return (
    <View style={styles.wrap} testID="folder">
      <View style={styles.tabRow}>
        <View style={[styles.tab, { backgroundColor: c.manila }]}>
          <Text style={[type.caption, styles.tabText, { color: c.manilaInk2 }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={[styles.tabSlant, { backgroundColor: c.manila }]} />
      </View>
      <View style={[styles.body, { backgroundColor: c.manila, borderTopColor: c.manilaEdge }]}>
        <Text style={[type.footnote, { color: c.manilaInk2 }]}>{empty ? 'Nothing filed yet' : 'Everything adds up to'}</Text>
        <Text testID="home-total" style={[type.figure, type.tabular, { color: c.manilaInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {formatMoney(summary.totalCents, currency, { whole: true })}
        </Text>
        <Text testID="home-count" style={[type.subhead, { color: c.manilaInk2, marginTop: 2 }]}>
          {empty
            ? `${plural(summary.rooms, 'room')} ready to fill`
            : `${plural(summary.count, 'item')} in ${plural(summary.rooms, 'room')}`}
        </Text>
        {empty ? null : (
          <View style={[styles.meters, { borderTopColor: c.manilaEdge }]}>
            <Meter label="Photographed" done={summary.withPhoto} total={summary.count} />
            <Meter label="Valued" done={summary.withValue} total={summary.count} />
          </View>
        )}
      </View>
    </View>
  );
}

const TAB_HEIGHT = 28;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.xl },
  tabRow: { flexDirection: 'row', height: TAB_HEIGHT, marginBottom: -1, zIndex: 1 },
  tab: { height: TAB_HEIGHT, maxWidth: '68%', borderTopLeftRadius: 9, paddingLeft: space.l, paddingRight: space.s, justifyContent: 'center' },
  tabText: { letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600' },
  tabSlant: { width: 24, height: TAB_HEIGHT, marginLeft: -12, borderTopRightRadius: 9, transform: [{ skewX: '24deg' }] },
  body: { borderRadius: 14, borderTopLeftRadius: 0, borderTopWidth: 1, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.l },
  meters: { flexDirection: 'row', gap: space.xl, marginTop: space.l, paddingTop: space.m, borderTopWidth: 1 },
  track: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
