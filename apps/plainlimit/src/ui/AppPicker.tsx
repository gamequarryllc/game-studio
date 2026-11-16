import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { SCREEN_TIME_AVAILABLE } from '@/platform/screenTime';

/**
 * Apple's own list of the phone's apps, as a sheet. The picks are kept by the
 * phone under `id`; the app is told how many there are and never which.
 * Draws nothing in a browser or in Expo Go.
 */
export function AppPicker({ id, open, header, onClose }: { id: string; open: boolean; header: string; onClose: () => void }) {
  if (!SCREEN_TIME_AVAILABLE || !open) return null;
  return (
    <DeviceActivitySelectionSheetViewPersisted
      style={{ width: 1, height: 1, position: 'absolute' }}
      familyActivitySelectionId={id}
      headerText={header}
      // A ticked category stays one category, not every app in it: iOS locks
      // whole categories without limit but at most 50 single apps (build 68's
      // picks listed every app of every category, and most never locked).
      includeEntireCategory={false}
      onDismissRequest={onClose}
      onSelectionChange={() => {}}
    />
  );
}
