import { View } from 'react-native';

import { useStoreValue } from '@/state/store';
import AppTabs from '@/ui/AppTabs';
import { c } from '@/ui/theme';

export default function TabsLayout() {
  // Until setup is done there is nothing here to show. The first launch starts
  // on this page for a moment before it is sent to setup, and Today flashed up
  // for a quarter of a second (the owner, build 107). A plain ground instead.
  const setupDone = useStoreValue((s) => s.doc.setupDone);
  if (!setupDone) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  return <AppTabs />;
}
