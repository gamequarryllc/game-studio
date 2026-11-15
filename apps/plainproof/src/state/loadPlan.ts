import { DocError } from '@/domain/doc';
import type { Library } from '@/domain/library';

// What to open at launch, decided from what the two saved copies hold. Kept
// apart from the store so every case is unit tested. The rule that matters: a
// file that is there but can't be read is never treated as a fresh install,
// because the first save after that would write an empty inventory over it.

export type ReadResult = { kind: 'missing' } | { kind: 'text'; text: string } | { kind: 'error' };

export type LoadFailure = 'unreadable' | 'too-new';

export type LoadPlan =
  | { kind: 'fresh' }
  | { kind: 'open'; library: Library; recovered: boolean }
  | { kind: 'failed'; reason: LoadFailure };

function attempt(read: ReadResult, parse: (text: string) => Library): { library: Library } | { failure: LoadFailure } | null {
  if (read.kind === 'missing') return null;
  if (read.kind === 'error') return { failure: 'unreadable' };
  try {
    return { library: parse(read.text) };
  } catch (e) {
    return { failure: e instanceof DocError && e.reason === 'too-new' ? 'too-new' : 'unreadable' };
  }
}

export function planLoad(main: ReadResult, previous: ReadResult, parse: (text: string) => Library): LoadPlan {
  const first = attempt(main, parse);
  if (first === null) {
    // No main file. A spare with nothing beside it means the app was stopped mid-swap: use the spare.
    const spare = attempt(previous, parse);
    if (spare && 'library' in spare) return { kind: 'open', library: spare.library, recovered: true };
    return { kind: 'fresh' };
  }
  if ('library' in first) return { kind: 'open', library: first.library, recovered: false };
  // Made by a newer version: opening the spare would quietly roll back to an older copy and then save over the newer one.
  if (first.failure === 'too-new') return { kind: 'failed', reason: 'too-new' };
  const spare = attempt(previous, parse);
  if (spare && 'library' in spare) return { kind: 'open', library: spare.library, recovered: true };
  return { kind: 'failed', reason: 'unreadable' };
}
