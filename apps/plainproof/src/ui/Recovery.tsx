import { useState } from 'react';
import { View } from 'react-native';

import { emptyDoc } from '@/domain/doc';
import { libraryOf } from '@/domain/library';
import { plural } from '@/domain/selectors';
import { restoreFromBackup } from '@/state/operations';
import { store, useStore } from '@/state/store';
import { confirm, notify } from '@/ui/dialogs';
import { Button, EmptyState } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

/**
 * Shown instead of the app when the saved inventory is there but could not be
 * opened. Nothing is saved while it is up, so the file is never overwritten by
 * an empty inventory; leaving it (a restore, or starting over) keeps a copy of
 * the unreadable file beside the new one.
 */
export function RecoveryScreen() {
  const { c } = useTheme();
  const failure = useStore().failure;
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await restoreFromBackup(() => Promise.resolve(true));
      if (outcome.kind === 'restored') {
        await notify('Backup restored', `${plural(outcome.items, 'item')} in ${plural(outcome.rooms, 'room')}, with ${plural(outcome.photos, 'photo')}.`);
      }
    } catch (e) {
      await notify('That backup could not be restored', e instanceof Error && e.name === 'DocError' ? e.message : 'The file may be damaged. Try another backup.');
    } finally {
      setBusy(false);
    }
  };

  const startOver = async () => {
    const ok = await confirm({
      title: 'Start with an empty inventory?',
      message: 'A copy of the file that could not be opened is kept on this iPhone, but the app will start empty. Restoring a backup is the better choice if you have one.',
      confirmLabel: 'Start over',
      destructive: true,
    });
    if (ok) await store.replace(libraryOf(emptyDoc(Date.now())));
  };

  const tooNew = failure === 'too-new';
  return (
    <View testID="recovery-screen" style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center', paddingHorizontal: space.s }}>
      <EmptyState
        icon="warning"
        title={tooNew ? 'Update Plainproof to open your inventory' : 'Your inventory couldn’t be opened'}
        body={
          tooNew
            ? 'It was saved by a newer version of the app. Update Plainproof from the App Store; nothing has been changed.'
            : 'The saved file is on this iPhone but could not be read. Nothing has been changed or saved over it. Restore your latest backup to carry on.'
        }
        action={
          tooNew ? undefined : (
            <View style={{ gap: space.s }}>
              <Button testID="recovery-restore" label="Restore from a backup" icon="restore" busy={busy} onPress={restore} />
              <Button testID="recovery-start-over" label="Start over" kind="plain" onPress={startOver} />
            </View>
          )
        }
      />
    </View>
  );
}
