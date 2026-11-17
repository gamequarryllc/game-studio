import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { c } from './theme';
import { useDay } from './useDay';

// The web preview's tab bar, drawn to match the iPhone's (AppTabs.tsx): a
// floating capsule with an icon over a small label for each tab, tinted in the
// battery's colour when open. The icons stand in for the SF Symbols the phone draws (battery.75percent
// and gearshape), which the web has no copy of.

function BatteryIcon({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 24 }}>
      <View style={{ width: 24, height: 12, borderRadius: 3.5, borderWidth: 1.6, borderColor: color, padding: 1.6 }}>
        <View style={{ width: '75%', height: '100%', borderRadius: 1.5, backgroundColor: color }} />
      </View>
      <View style={{ width: 2, height: 4.5, borderTopRightRadius: 1.5, borderBottomRightRadius: 1.5, backgroundColor: color }} />
    </View>
  );
}

function GearIcon({ color }: { color: string }) {
  const size = 22;
  return (
    <View style={{ width: size, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size }}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', left: size / 2 - 2.5, top: 0, width: 5, height: size, transform: [{ rotate: `${i * 45}deg` }] }}>
            <View style={{ width: 5, height: 6, borderRadius: 1.2, backgroundColor: color }} />
          </View>
        ))}
        <View style={{ position: 'absolute', left: 3, top: 3, width: size - 6, height: size - 6, borderRadius: size, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: c.ground }} />
        </View>
      </View>
    </View>
  );
}

function TabButton({ label, icon, accent, isFocused, ...props }: TabTriggerSlotProps & { label: string; icon: 'battery' | 'gear'; accent: string }) {
  const color = isFocused ? accent : c.ink3;
  return (
    <Pressable {...(props as PressableProps)} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={[styles.button, isFocused ? styles.chosen : null]}>
      {icon === 'battery' ? <BatteryIcon color={color} /> : <GearIcon color={color} />}
      <Text style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1, color }}>{label}</Text>
    </Pressable>
  );
}

export default function AppTabs() {
  // The open tab is marked in the battery's colour.
  const { accent } = useDay();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        {/* One flat style object: the router's slot can't merge an array of styles. */}
        <View style={StyleSheet.flatten(styles.bar)}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton label="Today" icon="battery" accent={accent} />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton label="Settings" icon="gear" accent={accent} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Floating over the page, as the iPhone's tab bar does: the page runs on underneath.
  bar: { position: 'absolute', bottom: 26, alignSelf: 'center', width: 232, flexDirection: 'row', padding: 4, borderRadius: 32, backgroundColor: 'rgba(38,40,44,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  button: { flex: 1, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', gap: 3 },
  chosen: { backgroundColor: 'rgba(255,255,255,0.10)' },
});
