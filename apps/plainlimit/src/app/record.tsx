import { StyleSheet, Text, View } from 'react-native';

import type { Cell } from '@/domain/record';
import { weekView } from '@/domain/week';
import { SCREEN_TIME_AVAILABLE, isOn } from '@/platform/screenTime';
import { Page, Title } from '@/ui/kit';
import { PassDot, useRecord, weekday } from '@/ui/RecordCard';
import { c, display } from '@/ui/theme';
import { UsageReport } from '@/ui/UsageReport';
import { WeekView } from '@/ui/WeekView';

// History, opened from Today: the last seven days in full, then the record
// (record.ts: the run without an emergency pass, perfect weeks, passes in the
// bank, the last 12 weeks day by day, when passes were used), then the phone's
// own list of what used the battery today. Up to build 129 the week and the
// list were on Today and this screen was "Your record" (the owner, 2026-11-22).

const UNDER = '#46CC70';
const RAN_OUT = '#FF7B6B';

function Square({ cell, pass }: { cell: Cell; pass: boolean }) {
  const fill = cell === 'under' ? UNDER : cell === 'ranOut' ? RAN_OUT : cell === 'partly' ? 'rgba(70,204,112,0.4)' : c.raised;
  // A pass day keeps its result colour, with the pass mark (as on Today's Last 7 days) on top.
  return (
    <View style={[styles.square, { backgroundColor: fill, opacity: cell === 'future' ? 0.35 : 1 }]}>
      {pass ? <PassDot /> : null}
    </View>
  );
}

function Ticket({ empty = false }: { empty?: boolean }) {
  return (
    <View style={[styles.ticket, empty ? styles.ticketEmpty : null]}>
      <View style={styles.ticketNotch} />
    </View>
  );
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The month's short name under the first week that starts in it ("Nov"), else nothing. */
function monthTick(start: string): string {
  const [y, m, d] = start.split('-').map(Number);
  return d <= 7 ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short' }) : '';
}

export default function Record() {
  // Asks the phone whether counting is on as it draws: not to be kept by the React Compiler.
  'use no memo';
  const { view, doc, now } = useRecord();
  const used = view.used.map((d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
  const fresh = view.streakWeeks === 0 && view.bestWeeks === 0;
  // Weeks before the record began are left off the grid, but never fewer than four.
  const shown = view.weeks.filter((w, i) => i >= 8 || w.days.some((d) => d.cell !== 'none' && d.cell !== 'future'));
  const thisWeek = view.weeks[view.weeks.length - 1].days;
  return (
    <Page top={8}>
      <Title>History</Title>

      {/* The week in full: Today shows only its bars. */}
      <View style={styles.card}>
        <WeekView week={weekView(doc.history, doc.day, doc.settings, now, !SCREEN_TIME_AVAILABLE || doc.watching === true, doc.record?.uses)} />
      </View>

      <Text style={styles.label}>Your record</Text>

      <View style={[styles.card, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
        {fresh ? (
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Text style={styles.heroSmall}>Starts this week</Text>
            <Text style={styles.body}>Each week without an emergency pass adds to it.</Text>
          </View>
        ) : (
          <>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Text style={styles.hero}>
                {view.streakWeeks} {view.streakWeeks === 1 ? 'week' : 'weeks'}
              </Text>
              <Text style={styles.body}>without an emergency pass</Text>
            </View>
            {view.bestWeeks > view.streakWeeks ? <Text style={styles.note}>Best: {view.bestWeeks} {view.bestWeeks === 1 ? 'week' : 'weeks'}</Text> : null}
          </>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[styles.card, styles.half]}>
          <View accessible={false} style={{ flexDirection: 'row', gap: 5, minHeight: 16, flexWrap: 'wrap' }}>
            {view.passes === 0 ? <Ticket empty /> : Array.from({ length: Math.min(view.passes, 6) }, (_, i) => <Ticket key={i} />)}
          </View>
          <Text style={[styles.stat, view.passes === 0 ? { color: c.ink3 } : null]}>
            {view.passes} {view.passes === 1 ? 'pass' : 'passes'} saved
          </Text>
          <Text style={styles.note}>Next one on {weekday(view.nextPass)}.</Text>
        </View>
        <View style={[styles.card, styles.half]}>
          <View accessible={false} style={{ flexDirection: 'row', gap: 3, minHeight: 16, alignItems: 'center' }}>
            {/* This week so far, day by day: what the next perfect week needs. */}
            {thisWeek.map((d, i) => (
              <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: d.cell === 'under' && !d.pass ? UNDER : d.cell === 'ranOut' || d.pass ? RAN_OUT : 'transparent', borderWidth: d.cell === 'future' || d.cell === 'none' ? 1.5 : 0, borderColor: c.rule }} />
            ))}
          </View>
          <Text style={[styles.stat, view.perfectWeeks === 0 ? { color: c.ink3 } : { color: UNDER }]}>
            {view.perfectWeeks} perfect {view.perfectWeeks === 1 ? 'week' : 'weeks'}
          </Text>
          <Text style={styles.note}>Every day under your goal, no pass. This week so far above.</Text>
        </View>
      </View>

      <Text style={styles.label}>Last {shown.length} weeks</Text>
      <View accessible accessibilityLabel={`The last ${shown.length} weeks, day by day. ${view.perfectWeeks} perfect weeks kept; passes used on ${view.used.length} days.`} style={styles.grid}>
        <View style={styles.column}>
          {DAY_LETTERS.map((l, i) => (
            <View key={i} style={styles.letterBox}>
              <Text style={styles.letter}>{l}</Text>
            </View>
          ))}
          <Text style={styles.letter}> </Text>
        </View>
        {shown.map((week) => (
          <View key={week.start} style={styles.column}>
            {week.days.map((d, i) => (
              <Square key={i} cell={d.cell} pass={d.pass} />
            ))}
            <View style={{ height: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: week.perfect ? UNDER : 'transparent' }} />
            <Text style={styles.letter}>{monthTick(week.start)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: UNDER }]} /><Text style={styles.keyText}>Under the goal</Text></View>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: RAN_OUT }]} /><Text style={styles.keyText}>Ran out</Text></View>
        <View style={styles.key}><View style={[styles.keySwatch, { backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }]}><PassDot size={5} /></View><Text style={styles.keyText}>Pass used</Text></View>
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

      {/* Last on the page: Apple's list sits in a box sized for five rows, and spare room at the end is only extra scroll. */}
      {isOn() ? (
        <View style={{ marginTop: 10 }}>
          <UsageReport settings={doc.settings} now={now} />
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, borderRadius: 20, padding: 16, gap: 8 },
  half: { flex: 1, padding: 14 },
  heroSmall: { fontFamily: display.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: c.ink },
  hero: { fontFamily: display.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.6, color: c.ink },
  stat: { fontFamily: display.bold, fontSize: 22, color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  label: { fontSize: 15, fontWeight: '600', color: c.ink3, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 5 },
  column: { flex: 1, maxWidth: 26, gap: 4, alignItems: 'center' },
  square: { width: '100%', aspectRatio: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  letterBox: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 10, lineHeight: 12, fontWeight: '600', color: c.ink3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 11, height: 11, borderRadius: 3 },
  keyText: { fontSize: 12, color: c.ink3 },
  useRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  ticket: { width: 22, height: 15, borderRadius: 3, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  ticketEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.ink3 },
  ticketNotch: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.card, position: 'absolute', right: -3 },
});
