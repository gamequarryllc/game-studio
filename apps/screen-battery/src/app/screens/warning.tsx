import { useRouter } from 'expo-router';

import { warningCopy } from '@/domain/shield';
import { toneForCells } from '@/domain/tone';
import { useDoc } from '@/state/store';
import { Shield } from '@/ui/Shield';

// A look at the warning screen, opened from Settings, under Developer.

export default function WarningPreview() {
  const router = useRouter();
  const { settings } = useDoc();
  const copy = warningCopy(settings);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return <Shield tone={toneForCells(1)} cells={1} title={copy.title} line={copy.line} primary={{ label: copy.primary, onPress: leave }} secondary={copy.secondary ? { label: copy.secondary, onPress: leave } : undefined} />;
}
