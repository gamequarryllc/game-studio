import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { Cell } from '@/domain/record';
import { glowForCells } from '@/domain/tone';
import { GlowField } from '@/ui/GlowBattery';
import { Card, IconTile, Label, Page, Title, tiles } from '@/ui/kit';
import { useRecord, weekday } from '@/ui/RecordCard';
import { c, display } from '@/ui/theme';

// History, opened from Today, in the Glow look (the owner's pick of three
// mock-ups, 2026-11-22: the screen before it, a column of cards and a mostly
// empty grid, "wasn't the vibe"). One big number first: the streak, which is
// the days in a row without an emergency pass. It is not the days under the
// goal (the owner again, the same day): those slip, and a streak that keeps
// breaking puts people off, while a pass is only ever used on purpose. Then
// the last five weeks as lights, a day each, with the date on it; then the
// passes in the bank and the perfect weeks. Nothing here repeats Today's bars,
// and the first day has something to show: 1.

const LIT = glowForCells(6);
const RAN_OUT = '#FF6B5E';
const PASS = tiles.orange;
const WEEKS_SHOWN = 5;
/** The light behind the number: its middle, and how far it reaches, from the top of the page. */
const GLOW = 175;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The date `days` after a week's Monday ("2026-11-16"). */
function dateIn(start: string, days: number): Date {
  const [y, m, d] = start.split('-').map(Number);
  return new Date(y, m - 1, d + days);
}

/** "November", or "October and November" when the weeks shown cross a month. */
function monthsLabel(first: Date, last: Date): string {
  const name = (d: Date) => d.toLocaleDateString(undefined, { month: 'long' });
  return first.getMonth() === last.getMonth() ? name(last) : `${name(first)} and ${name(last)}`;
}

/** One day as a light: lit under the goal, red when the battery ran out, an outline otherwise; today wears a ring. */
function DayLight({ date, cell, pass, today }: { date: number; cell: Cell; pass: boolean; today: boolean }) {
  // Today lights up once it is over; until then only a day that has already run out shows its colour.
  const shown: Cell = today && cell !== 'ranOut' ? 'none' : cell;
  const fill = shown === 'under' ? LIT : shown === 'ranOut' ? RAN_OUT : shown === 'partly' ? 'rgba(77,242,143,0.28)' : 'transparent';
  const lit = shown === 'under' || shown === 'ranOut';
  return (
    <View style={styles.dayBox}>
      <View style={[styles.ring, today ? { borderColor: c.ink } : null]}>
        <View
          style={[
            styles.light,
            { backgroundColor: fill },
            lit ? { shadowColor: fill, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null,
            shown === 'none' || shown === 'partly' ? { borderWidth: 1.5, borderColor: c.rule } : null,
            cell === 'future' ? { opacity: 0.45 } : null,
          ]}>
          <Text style={[styles.date, lit ? { color: c.onPaper, fontWeight: '700' } : cell === 'future' ? { color: c.ink3 } : null]}>{date}</Text>
        </View>
        {pass ? <View style={styles.passMark} /> : null}
      </View>
    </View>
  );
}

function Key({ color, words }: { color: string; words: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.keyDot, { backgroundColor: color }]} />
      <Text style={styles.keyText}>{words}</Text>
    </View>
  );
}

export default function Record() {
  const { view, doc } = useRecord();
  const { width } = useWindowDimensions();
  const weeks = view.weeks.slice(-WEEKS_SHOWN);
  const firstShown = dateIn(weeks[0].start, 0);
  const lastShown = dateIn(weeks[weeks.length - 1].start, 6);
  // Today is the battery's day: at 1 AM, before a 6 AM recharge, that is still yesterday's date.
  const battery = new Date(doc.day.periodStart);
  const isToday = (d: Date) => d.getFullYear() === battery.getFullYear() && d.getMonth() === battery.getMonth() && d.getDate() === battery.getDate();
  const passDays = weeks.reduce((sum, w) => sum + w.days.filter((d) => d.pass).length, 0);

  // The number at the top: days without a pass, today among them, so it is 1 on the first day and 0 only on a day a pass was used.
  const streak = view.streakDays;
  const line = streak > 0 ? `${streak === 1 ? 'day' : 'days'} without an emergency pass` : 'A pass was used today. A new streak starts tomorrow.';
  // The best run, once the running one is behind it: something to beat.
  const best = view.bestDays > streak ? `Your best: ${view.bestDays} ${view.bestDays === 1 ? 'day' : 'days'}` : null;

  return (
    <Page header top={8}>
      {/* The light is gone by the top of the page, so no edge shows under the bar with the back button. */}
      <GlowField color={LIT} width={width} centre={GLOW} reach={GLOW} />
      <Title>History</Title>

      <View accessible accessibilityLabel={`Your streak: ${streak > 0 ? `${streak} ${line}` : line}${best ? `. ${best}` : ''}`} style={styles.hero}>
        {/* Lit while it runs; plain on the day a pass ended it. */}
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.big, streak === 0 ? { color: c.ink2 } : null]}>
          {streak}
        </Text>
        <Text style={styles.heroLine}>{line}</Text>
        {best ? <Text style={styles.best}>{best}</Text> : null}
      </View>

      <Card style={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}>
        <Label style={{ marginLeft: 4 }}>{monthsLabel(firstShown, lastShown)}</Label>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`The last ${WEEKS_SHOWN} weeks, a light for each day: lit when the day stayed under your goal, red when the battery ran out. ${passDays === 0 ? 'No passes used.' : `Passes used on ${passDays} ${passDays === 1 ? 'day' : 'days'}.`}`}
          style={{ gap: 7 }}>
          <View style={styles.week}>
            {DAY_LETTERS.map((l, i) => (
              <View key={i} style={styles.dayBox}>
                <Text style={styles.letter}>{l}</Text>
              </View>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={week.start} style={styles.week}>
              {week.days.map((d, i) => {
                const date = dateIn(week.start, i);
                return <DayLight key={i} date={date.getDate()} cell={d.cell} pass={d.pass} today={isToday(date)} />;
              })}
            </View>
          ))}
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.legend}>
          <Key color={LIT} words="Under your goal" />
          <Key color={RAN_OUT} words="Ran out" />
          <Key color={PASS} words="Pass used" />
        </View>
      </Card>

      <Card style={styles.rowCard}>
        <IconTile icon={{ name: 'pass', bg: tiles.orange }} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.rowLabel}>Emergency passes</Text>
          <Text style={styles.rowSub}>Next one on {weekday(view.nextPass)}</Text>
        </View>
        <Text style={styles.rowValue}>
          {view.passes} saved
        </Text>
      </Card>

      <Card style={styles.rowCard}>
        <IconTile icon={{ name: 'pro', bg: tiles.yellow }} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.rowLabel}>Perfect weeks</Text>
          <Text style={styles.rowSub}>Every day under your goal, no pass</Text>
        </View>
        <Text style={styles.rowValue}>{view.perfectWeeks}</Text>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 4, paddingTop: 2, paddingBottom: 8 },
  big: { fontFamily: display.bold, fontSize: 92, lineHeight: 94, letterSpacing: -3.5, color: LIT },
  heroLine: { fontFamily: display.semi, fontSize: 19, lineHeight: 24, color: c.ink2, marginTop: 2 },
  best: { fontSize: 14, lineHeight: 19, color: c.ink3, marginTop: 4 },
  week: { flexDirection: 'row' },
  dayBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: c.ink3 },
  // The ring is there for every day, clear but for today, so the lights line up.
  ring: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  light: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  date: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: c.ink3, fontVariant: ['tabular-nums'] },
  passMark: { position: 'absolute', right: -1, top: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: PASS, borderWidth: 2, borderColor: c.card },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginLeft: 4, marginTop: 2 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 10, height: 10, borderRadius: 5 },
  keyText: { fontSize: 12.5, lineHeight: 16, color: c.ink3 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  rowSub: { fontSize: 13.5, lineHeight: 18, color: c.ink3 },
  rowValue: { fontFamily: display.semi, fontSize: 16, color: c.ink2 },
});
