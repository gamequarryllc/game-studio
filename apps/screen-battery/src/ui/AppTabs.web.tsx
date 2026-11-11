import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { c } from './theme';
import { useDay } from './useDay';

// The web preview's tab bar, drawn to sit where the iPhone's would.

function TabButton({ label, accent, isFocused, ...props }: TabTriggerSlotProps & { label: string; accent: string }) {
  return (
    <Pressable {...(props as PressableProps)} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={styles.button}>
      <View style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: isFocused ? accent : 'transparent' }} />
      <Text style={{ fontSize: 15, fontWeight: isFocused ? '700' : '500', color: isFocused ? c.ink : c.ink3 }}>{label}</Text>
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
            <TabButton label="Today" accent={accent} />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton label="Settings" accent={accent} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.ground, paddingTop: 6, paddingBottom: 22, paddingHorizontal: 20 },
  button: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', gap: 7 },
});
