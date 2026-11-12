import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { HAIRLINE, useTheme } from './theme';

// The web preview's tab bar, drawn to sit where the iPhone's would.

function TabButton({ icon, label, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const { c } = useTheme();
  const color = isFocused ? c.blue : c.ink3;
  return (
    <Pressable {...(props as PressableProps)} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={styles.button}>
      <Icon name={icon} size={25} color={color} />
      <Text style={[styles.label, { color, fontWeight: isFocused ? '600' : '500' }]}>{label}</Text>
    </Pressable>
  );
}

export default function AppTabs() {
  const { c } = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        {/* One flat style object: the router's slot can't merge an array of styles. */}
        <View style={StyleSheet.flatten([styles.bar, BLUR, { backgroundColor: c.bar, borderTopColor: c.rule }])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="tabDue" label="Due" />
          </TabTrigger>
          <TabTrigger name="things" href="/things" asChild>
            <TabButton icon="tabThings" label="Things" />
          </TabTrigger>
          <TabTrigger name="log" href="/log" asChild>
            <TabButton icon="tabLog" label="Log" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="tabSettings" label="Settings" />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

/** What scrolls under the bar is blurred, as it is under the iPhone's own. */
const BLUR = { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object;

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: HAIRLINE, paddingTop: 7, paddingBottom: 22 },
  button: { flex: 1, alignItems: 'center', gap: 2 },
  label: { fontSize: 10, lineHeight: 12 },
});
