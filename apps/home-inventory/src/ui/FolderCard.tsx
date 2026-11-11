import { PixelRatio, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { figureSize, formatMoney } from '@/domain/money';
import { plural, type HomeSummary } from '@/domain/selectors';

import { fitSideBySide } from './fit';
import { space, type, useTheme } from './theme';

// The manila folder at the top of the Rooms screen: what the household adds
// up to, and how much of it is properly documented.

function Meter({ label, done, total, stacked, testID }: { label: string; done: number; total: number; stacked: boolean; testID: string }) {
  const { c } = useTheme();
  const ratio = total === 0 ? 0 : done / total;
  return (
    <View accessible accessibilityLabel={`${label}: ${done} of ${total}`} style={stacked ? null : { flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s }}>
        <Text testID={`${testID}-label`} style={[type.footnote, { color: c.manilaInk2, flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <Text testID={`${testID}-count`} style={[type.footnote, type.tabular, { color: c.manilaInk, fontWeight: '600' }]} numberOfLines={1}>
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

export function FolderCard({
  label,
  summary,
  currency,
  sample,
}: {
  label: string;
  summary: HomeSummary;
  currency: string;
  /** The made-up folder on the welcome screen: a picture, not the person's own figures. */
  sample?: boolean;
}) {
  const { c } = useTheme();
  const empty = summary.count === 0;
  // The example on the welcome screen has test ids of its own, so the two never get mixed up.
  const id = (name: string) => (sample ? `sample-${name}` : name);
  // The two meters share a row when both fit; with long counts, a narrow
  // screen or large text they go one above the other instead of colliding.
  const { width } = useWindowDimensions();
  const inside = Math.min(width, MAX_WIDTH) - 2 * space.xl - 2 * space.l;
  const sideBySide = fitSideBySide(
    [
      ['Photographed', `${summary.withPhoto} of ${summary.count}`],
      ['Valued', `${summary.withValue} of ${summary.count}`],
    ],
    inside,
    METER_GAP,
    PixelRatio.getFontScale(),
  );
  const total = formatMoney(summary.totalCents, currency, { whole: true });
  const size = figureSize(total, type.figure.fontSize);
  return (
    <View
      style={styles.wrap}
      testID={sample ? 'folder-sample' : 'folder'}
      accessible={sample}
      accessibilityLabel={sample ? 'An example of the summary the app keeps for your home' : undefined}>
      <View style={styles.tabRow}>
        <View style={[styles.tab, { backgroundColor: c.manila }]}>
          <Text testID={id('folder-label')} style={[type.caption, styles.tabText, { color: c.manilaInk2 }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View testID={id('folder-slant')} style={[styles.tabSlant, { backgroundColor: c.manila }]} />
      </View>
      <View style={[styles.body, { backgroundColor: c.manila, borderTopColor: c.manilaEdge }]}>
        {empty ? (
          <Text testID={id('home-empty')} style={[type.title, { color: c.manilaInk }]}>
            Nothing filed yet
          </Text>
        ) : (
          <>
            <Text style={[type.footnote, { color: c.manilaInk2 }]}>Everything adds up to</Text>
            <Text
              testID={id('home-total')}
              style={[type.figure, type.tabular, { color: c.manilaInk, fontSize: size, lineHeight: Math.round(size * 1.14) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {total}
            </Text>
          </>
        )}
        <Text testID={id('home-count')} style={[type.subhead, { color: c.manilaInk2, marginTop: 2 }]}>
          {empty
            ? `${plural(summary.rooms, 'room')} ready to fill`
            : `${plural(summary.count, 'item')} in ${plural(summary.rooms, 'room')}`}
        </Text>
        {empty ? null : (
          <View style={[styles.meters, sideBySide ? styles.metersRow : styles.metersStack, { borderTopColor: c.manilaEdge }]}>
            <Meter testID={id('meter-photo')} label="Photographed" done={summary.withPhoto} total={summary.count} stacked={!sideBySide} />
            <Meter testID={id('meter-value')} label="Valued" done={summary.withValue} total={summary.count} stacked={!sideBySide} />
          </View>
        )}
      </View>
    </View>
  );
}

const TAB_HEIGHT = 28;
const METER_GAP = space.l;
/** The web preview never draws the app wider than this (the root layout). */
const MAX_WIDTH = 480;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.xl },
  tabRow: { flexDirection: 'row', height: TAB_HEIGHT, marginBottom: -1, zIndex: 1 },
  // The slanted edge overlaps the last 12 points of the tab, so the label stops well short of it.
  tab: { height: TAB_HEIGHT, maxWidth: '68%', borderTopLeftRadius: 9, paddingLeft: space.l, paddingRight: space.xl, justifyContent: 'center' },
  tabText: { letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600' },
  tabSlant: { width: 24, height: TAB_HEIGHT, marginLeft: -12, borderTopRightRadius: 9, transform: [{ skewX: '24deg' }] },
  body: { borderRadius: 14, borderTopLeftRadius: 0, borderTopWidth: 1, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.l },
  meters: { marginTop: space.l, paddingTop: space.m, borderTopWidth: 1 },
  metersRow: { flexDirection: 'row', gap: METER_GAP },
  metersStack: { gap: space.m },
  track: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
