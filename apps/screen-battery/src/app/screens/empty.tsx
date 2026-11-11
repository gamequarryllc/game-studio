import { useRouter } from 'expo-router';

import { emptyCopy } from '@/domain/shield';
import { toneForCells } from '@/domain/tone';
import { useDoc } from '@/state/store';
import { Shield } from '@/ui/Shield';

// A look at the empty screen, opened from Settings, under Developer. It
// follows the level chosen in Settings.

export default function EmptyPreview() {
  const router = useRouter();
  const { settings, day } = useDoc();
  const copy = emptyCopy(settings, day.topUps);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const through = settings.emptyLevel === 'work' ? () => router.replace('/puzzle') : leave;
  return <Shield tone={toneForCells(0)} cells={0} title={copy.title} line={copy.line} primary={{ label: copy.primary, onPress: leave }} secondary={copy.secondary ? { label: copy.secondary, onPress: through } : undefined} />;
}
