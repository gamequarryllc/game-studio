import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dueText, dueWhere, repeatText } from '@/domain/labels';
import type { Listed } from '@/domain/schedule';
import type { DistanceUnit, Ymd } from '@/domain/types';
import { tap } from '@/platform/haptics';

import { dueTone, leadsByDistance, readoutOf } from './due';
import { Icon } from './Icon';
import { NO_ORPHAN, space, toneColor, type, useTheme } from './theme';

// One job on a list. The ring on the left is the hole a tag hangs by, and it is
// also the way to say the job is done: punch it.

export function Punch({ onPress, color, label, testID }: { onPress: () => void; color: string; label: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 12, bottom: 12, left: 14, right: 8 }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.punch, { borderColor: color, backgroundColor: pressed ? color : c.card }]}>
      {({ pressed }) => (pressed ? <Icon name="check" size={14} color={c.card} /> : null)}
    </Pressable>
  );
}

/** A thing's name, short enough to share a line with a date. */
function shortName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name;
}

/** Joined with non-breaking spaces, so a date or a reading wraps whole or not at all. */
const solid = (text: string) => text.replace(/ /g, '\u00A0');

export function JobRow({
  item,
  today,
  unit,
  showThing = true,
  onOpen,
  onDone,
}: {
  item: Listed;
  today: Ymd;
  unit: DistanceUnit;
  /** Off on a thing's own screen, where every line is that thing's. */
  showThing?: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const { c } = useTheme();
  const { job, thing, due } = item;
  const tone = dueTone(due);
  const color = toneColor(c, tone);
  const readout = readoutOf(due, unit);
  const quiet = due.state === 'paused' || due.state === 'finished';
  const line = dueText(due, unit, today);
  // A job nobody has logged has no date to show: say how often it comes round instead.
  const where = due.state === 'unlogged' ? repeatText(job, unit) : dueWhere(due, unit, today, leadsByDistance(due) ? 'distance' : 'date');
  return (
    <View style={styles.row}>
      {quiet ? <View style={styles.punchSpace} /> : <Punch testID={`punch-${job.id}`} color={due.state === 'unlogged' ? c.ink3 : color} label={`Mark ${job.name} done`} onPress={onDone} />}
      <Pressable
        testID={`job-${job.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${job.name}, ${showThing ? `${thing.name}, ` : ''}${line}`}
        onPress={() => {
          tap();
          onOpen();
        }}
        style={({ pressed }) => [styles.body, pressed ? { opacity: 0.6 } : null]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, NO_ORPHAN, { color: quiet ? c.ink2 : c.ink }]} numberOfLines={3} lineBreakStrategyIOS="push-out">
            {job.name}
          </Text>
          {/* One line that may run to two. A long name is shortened here, so the date or reading after it never is. */}
          <Text testID={`where-${job.id}`} style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={2}>
            {showThing ? `${shortName(thing.name)} · ${solid(where)}` : where}
          </Text>
        </View>
        {readout ? (
          <View style={styles.readout}>
            <Text style={[type.readout, { color }]} numberOfLines={1}>
              {readout.figure}
            </Text>
            <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>
              {readout.unit}
            </Text>
          </View>
        ) : null}
        <Icon name="chevron" size={13} color={c.ink3} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.l, minHeight: 62 },
  punch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  punchSpace: { width: 26, height: 26 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.m, paddingRight: space.m, paddingVertical: 10 },
  readout: { alignItems: 'flex-end', minWidth: 36, marginLeft: 2 },
});
