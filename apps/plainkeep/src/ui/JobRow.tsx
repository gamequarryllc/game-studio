import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dueText, dueWhere } from '@/domain/labels';
import type { Listed } from '@/domain/schedule';
import type { DistanceUnit, Ymd } from '@/domain/types';
import { tap } from '@/platform/haptics';

import { dueTone, leadsByDistance, readoutOf } from './due';
import { Gauge } from './Gauge';
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
      hitSlop={10}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.punch, { borderColor: color, backgroundColor: pressed ? color : c.page }]}>
      {({ pressed }) => (pressed ? <Icon name="check" size={14} color={c.card} /> : null)}
    </Pressable>
  );
}

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
  const where = dueWhere(due, unit, today, leadsByDistance(due) ? 'distance' : 'date');
  return (
    <View style={styles.row}>
      {quiet ? <View style={styles.punchSpace} /> : <Punch testID={`punch-${job.id}`} color={color} label={`Mark ${job.name} done`} onPress={onDone} />}
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
          <Text style={[type.body, NO_ORPHAN, { color: quiet ? c.ink2 : c.ink }]} numberOfLines={2} lineBreakStrategyIOS="push-out">
            {job.name}
          </Text>
          <Text style={[type.footnote, { color: c.ink2, marginTop: 1 }]} numberOfLines={1}>
            {showThing ? `${thing.name} · ${where}` : where}
          </Text>
          {quiet || due.used === null ? null : (
            <View style={{ marginTop: 7, maxWidth: 132 }}>
              <Gauge used={due.used} tone={tone} marks={22} height={7} />
            </View>
          )}
        </View>
        {readout ? (
          <View style={styles.readout}>
            <Text style={[type.readout, { color }]} numberOfLines={1}>
              {readout.figure}
            </Text>
            <Text style={[type.unit, { color: c.ink2 }]} numberOfLines={1}>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.l, minHeight: 74 },
  punch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  punchSpace: { width: 26, height: 26 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.m, paddingRight: space.m, paddingVertical: 11 },
  readout: { alignItems: 'flex-end', minWidth: 54 },
});
