import { NativeTabs } from 'expo-router/native-tabs';

import { useDay } from './useDay';

// The iPhone's own tab bar. The web preview draws one itself: AppTabs.web.tsx.

export default function AppTabs() {
  // The open tab is marked in the battery's colour.
  const { accent } = useDay();
  return (
    <NativeTabs tintColor={accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'battery.75percent', selected: 'battery.75percent' }} md="battery_5_bar" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
