import { StyleSheet, Text, View } from 'react-native';

import type { Cell } from '@/domain/record';
import { Page, Title } from '@/ui/kit';
import { useRecord, weekday } from '@/ui/RecordCard';
import { c, display } from '@/ui/theme';

// Your record (record.ts): the run without an emergency pass, perfect weeks,
// passes in the bank, the last 12 weeks day by day, and when passes were used.

const UNDER = '#46CC70';
const RAN_OUT = '#FF7B6B';

function Square({ cell, pass }: { cell: Cell; pass: boolean }) {
  const fill = cell === 'under' ? UNDER : cell === 'ranOut' ? RAN_OUT : cell === 'partly' ? 'rgba(70,204,112,0.4)' : c.raised;
  if (pass) return <View style={[styles.square, { backgroundColor: c.ground, borderWidth: 2, borderColor: c.ink }]} />;
  return <View style={[styles.square, { backgroundColor: fill, opacity: cell === 'future' ? 0.35 : 1 }]} />;
}

function Ticket() {
  return (
    <View style={styles.ticket}>
      <View style={styles.ticketNotch} />
    </View>
  );
}

export default function Record() {
  const { view } = useRecord();
  const used = view.used.map((d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
  return (
    <Page top={8}>
      <Title>Your record</Title>

      <View style={[styles.card, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={styles.hero}>
            {view.streakWeeks} {view.streakWeeks === 1 ? 'week' : 'weeks'}
          </Text>
          <Text style={styles.body}>without an emergency pass</Text>
        </View>
        <Text style={styles.note}>Best: {view.bestWeeks} {view.bestWeeks === 1 ? 'week' : 'weeks'}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[styles.card, styles.half]}>
          <View accessible={false} style={{ flexDirection: 'row', gap: 5, minHeight: 16, flexWrap: 'wrap' }}>
            {Array.from({ length: Math.min(view.passes, 6) }, (_, i) => (
              <Ticket key={i} />
            ))}
          </View>
          <Text style={styles.stat}>
            {view.passes} {view.passes === 1 ? 'pass' : 'passes'}
          </Text>
          <Text style={styles.note}>in the bank. Next one on {weekday(view.nextPass)}.</Text>
        </View>
        <View style={[styles.card, styles.half]}>
          <View accessible={false} style={{ flexDirection: 'row', gap: 3, minHeight: 16, alignItems: 'center' }}>
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: UNDER }} />
            ))}
          </View>
          <Text style={[styles.stat, { color: UNDER }]}>{view.perfectWeeks} perfect</Text>
          <Text style={styles.note}>weeks with every day under your goal.</Text>
        </View>
      </View>

      <Text style={styles.label}>Last 12 weeks</Text>
      <View accessible accessibilityLabel={`The last 12 weeks, day by day. ${view.perfectWeeks} perfect weeks kept; passes used on ${view.used.length} days.`} style={styles.grid}>
        {view.weeks.map((week) => (
          <View key={week.start} style={styles.column}>
            {week.days.map((d, i) => (
              <Square key={i} cell={d.cell} pass={d.pass} />
            ))}
            <View style={{ height: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: week.perfect ? UNDER : 'transparent' }} />
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: UNDER }]} /><Text style={styles.keyText}>Under the goal</Text></View>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: RAN_OUT }]} /><Text style={styles.keyText}>Ran out</Text></View>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: c.ground, borderWidth: 2, borderColor: c.ink }]} /><Text style={styles.keyText}>Pass used</Text></View>
        <View style={styles.key}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: UNDER }} /><Text style={styles.keyText}>Perfect week</Text></View>
      </View>

      <Text style={[styles.label, { marginTop: 6 }]}>Passes used</Text>
      {used.length === 0 ? (
        <Text style={styles.body}>None yet.</Text>
      ) : (
        <View>
          {used.slice(0, 8).map((d, i) => (
            <View key={`${d}-${i}`} style={[styles.useRow, i < Math.min(used.length, 8) - 1 ? styles.rule : null]}>
              <Text style={styles.body}>{d}</Text>
              <Text style={styles.note}>15 minutes</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.note}>A pass opens everything, settings too, for 15 minutes. One is added each Monday, they bank with no limit, and one can be used a day.</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, borderRadius: 20, padding: 16, gap: 8 },
  half: { flex: 1, padding: 14 },
  hero: { fontFamily: display.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.6, color: c.ink },
  stat: { fontFamily: display.bold, fontSize: 22, color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  label: { fontSize: 15, fontWeight: '600', color: c.ink3, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 5 },
  column: { flex: 1, gap: 4, alignItems: 'center' },
  square: { width: '100%', aspectRatio: 1, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 11, height: 11, borderRadius: 3 },
  keyText: { fontSize: 12, color: c.ink3 },
  useRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  ticket: { width: 22, height: 15, borderRadius: 3, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  ticketNotch: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.card, position: 'absolute', right: -3 },
});
