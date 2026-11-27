import { useEffect, useRef } from 'react';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { SCREEN_TIME_AVAILABLE } from '@/platform/screenTime';

/** How long the picks get to be saved after Apple's sheet closes. */
const SAVE_MS = 600;

/**
 * Apple's own list of the phone's apps, as a sheet. The picks are kept by the
 * phone under `id`; the app is told how many there are and never which.
 * Draws nothing in a browser or in Expo Go.
 */
export function AppPicker({ id, open, header, onClose, onClosing, wholeCategories = false }: { id: string; open: boolean; header: string; onClose: () => void; onClosing?: () => void; wholeCategories?: boolean }) {
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onClose);
  const leaving = useRef(onClosing);
  useEffect(() => {
    done.current = onClose;
    leaving.current = onClosing;
    if (!open) closing.current = null;
  });
  if (!SCREEN_TIME_AVAILABLE || !open) return null;
  // Apple's sheet hands over the picks as Done is tapped, and the list is
  // saved a tenth of a second after that. Closing at once took the list off
  // the screen before it was saved, so the picks were lost and step 1 never
  // showed as done (build 95, on a fresh install). The list stays for a
  // moment after the sheet has gone, and only then is the screen told.
  // Build 107 always waited the whole time, which made the gap between the
  // two lists of Essentials feel long. The library says when it has saved
  // (`onSelectionChange`), so the screen is told then; the wait is only the
  // longest it can be, for a list closed with nothing changed.
  const finish = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => {}, 0);
    done.current();
  };
  // `onClosing`: the sheet has gone and the picks are being saved. Until
  // `onClose` the screen behind looks as it did before the list opened, for
  // up to a second (the owner's recording of build 170: setup's essentials
  // screen sat there offering "Choose essential apps" again), so it is told,
  // and can say it is saving.
  const close = () => {
    if (closing.current) return;
    closing.current = setTimeout(finish, SAVE_MS);
    leaving.current?.();
  };
  const saved = () => {
    if (closing.current) finish();
  };
  return (
    <DeviceActivitySelectionSheetViewPersisted
      style={{ width: 1, height: 1, position: 'absolute' }}
      familyActivitySelectionId={id}
      headerText={header}
      // `wholeCategories`: a ticked category also lists every app in it, which
      // the essentials model needs (it works with the apps one by one). The
      // older single list kept a category as one category, since iOS locks at
      // most 50 single apps (build 68 listed every app, and most never locked).
      includeEntireCategory={wholeCategories}
      onDismissRequest={close}
      onSelectionChange={saved}
    />
  );
}
