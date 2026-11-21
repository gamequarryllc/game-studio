import { StyleSheet, Text, View } from 'react-native';

import { CELLS } from '@/domain/battery';
import { durationLabel } from '@/domain/day';
import { accentOnDark, toneForCells } from '@/domain/tone';
import { earnedLine, weekLine, type Week, type WeekColumn } from '@/domain/week';

import { Label } from './kit';
import { PassDot } from './RecordCard';
import { c } from './theme';

// The last seven batteries side by side, each filled as far as it was used:
// green if the day stayed under the goal, red if it ran out (a full bar).

const FULL_NAMES: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

function spoken(col: WeekColumn): string {
  const line = spokenDay(col);
  return col.pass ? `${line}, an emergency pass was used` : line;
}

function spokenDay(col: WeekColumn): string {
  const name = col.today ? 'Today' : FULL_NAMES[col.weekday];
  if (col.state === 'unknown') return `${name}: not recorded`;
  if (col.state === 'off') return `${name}: counting was off`;
  const used = `at least ${durationLabel(col.usedMinutes)} of ${durationLabel(col.goalMinutes)}`;
  const outcome = col.today ? 'so far' : col.usedMinutes >= col.goalMinutes ? 'ran out' : col.state === 'partly' ? 'not fully counted' : 'under the goal';
  return `${name}: ${used}, ${outcome}`;
}

function Column({ col }: { col: WeekColumn }) {
  const shown = col.state !== 'unknown' && col.state !== 'off';
  const fill = Math.max(0, Math.min(1, col.usedMinutes / col.goalMinutes));
  // Two states only: under the goal in the full battery's green, ran out in a
  // red light enough to read on the dark ground. How close a day came is the
  // bar's height; colouring that too painted good days in warning colours.
  const colour = col.usedMinutes >= col.goalMinutes ? accentOnDark(toneForCells(0)) : toneForCells(CELLS).bg;
  return (
    <View accessible accessibilityLabel={spoken(col)} style={styles.column}>
      <View style={styles.track}>
        {shown && fill > 0 ? <View style={{ height: `${Math.max(6, fill * 100)}%`, backgroundColor: colour, opacity: col.state === 'partly' ? 0.4 : 1, borderRadius: 8 }} /> : null}
        {col.state === 'off' ? <Text style={styles.mark}>off</Text> : null}
      </View>
      <Text style={[styles.day, col.today ? styles.today : null]}>{col.today ? 'Today' : col.weekday}</Text>
      <View style={styles.passSlot}>{col.pass ? <PassDot /> : null}</View>
    </View>
  );
}

export function WeekView({ week }: { week: Week }) {
  const faded = week.columns.some((col) => col.state === 'partly');
  const earned = earnedLine(week);
  const passes = week.columns.filter((col) => col.pass).length;
  return (
    <View style={{ gap: 12 }}>
      <Label>Last 7 days</Label>
      <View style={styles.row}>
        {week.columns.map((col) => (
          <Column key={col.date} col={col} />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.body}>{weekLine(week)}</Text>
        {earned ? <Text style={styles.note}>{earned}</Text> : null}
        {passes > 0 ? <Text style={styles.note}>{passes === 1 ? 'A dot marks the day you used an emergency pass.' : 'A dot marks each day you used an emergency pass.'}</Text> : null}
        {faded ? <Text style={styles.note}>A faded day was not fully counted, so it is not claimed as under the goal.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, alignItems: 'stretch', gap: 6 },
  track: { height: 76, borderRadius: 8, backgroundColor: c.raised, justifyContent: 'flex-end', overflow: 'hidden' },
  passSlot: { height: 6, alignItems: 'center', marginTop: -2 },
  mark: { position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: '600', color: c.ink3 },
  day: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: c.ink3 },
  today: { color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
});
