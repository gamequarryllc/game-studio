import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tap } from '@/platform/haptics';
import { Chevron, IconTile } from '@/ui/kit';
import { c } from '@/ui/theme';

// The emergency pass on Today (the owner's pick "Quiet row", 2026-11-22). Up
// to build 143 it showed only when it could be used, as an orange row like
// any other, so nobody knew a pass existed until the battery was empty, and
// nothing about it said that using one ends the streak. Now it is always on
// Today: grey and still beside History while it can't be used, and red, with
// a warning mark and its cost, under an empty battery. The red row opens the
// "Use an emergency pass?" screen; nothing is spent by the tap itself.

const QUIET = '#7D838A';

export function PassRow({ usable, sub, passes, color, onPress }: { usable: boolean; sub: string; passes: number; color: string; onPress: () => void }) {
  const value = `${passes} saved`;
  const label = `Emergency pass, ${value}. ${sub.replace('\n', ' ')}`;
  const body = (
    <>
      <IconTile icon={usable ? { name: 'warn', bg: color } : { name: 'pass', bg: '#3A3E44', fg: '#8D939A' }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={[styles.name, usable ? null : { color: c.ink3 }]}>
          Emergency pass
        </Text>
        <Text numberOfLines={2} style={[styles.sub, { color: usable ? '#FFB4B4' : QUIET }]}>
          {sub}
        </Text>
      </View>
      <Text numberOfLines={1} style={[styles.value, { color: usable ? '#FF9A9A' : QUIET }]}>
        {value}
      </Text>
      {usable ? <Chevron color="#FF9A9A" /> : null}
    </>
  );
  if (!usable) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={label} style={[styles.row, styles.quiet]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { borderWidth: 2, borderColor: color, backgroundColor: color.length === 7 ? `${color}1A` : c.card }, pressed ? { opacity: 0.7 } : null]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 58, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  quiet: { borderWidth: 1, borderColor: c.rule, backgroundColor: c.card },
  name: { fontSize: 16, fontWeight: '500', color: c.ink },
  sub: { fontSize: 13.5, lineHeight: 18 },
  value: { fontSize: 16 },
});
