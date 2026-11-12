import { Redirect } from 'expo-router';

import { useDoc } from '@/state/store';
import AppTabs from '@/ui/AppTabs';

export default function TabsLayout() {
  const doc = useDoc();
  // A brand-new log starts at the welcome screen.
  if (!doc.settings.onboarded) return <Redirect href="/welcome" />;
  return <AppTabs />;
}
