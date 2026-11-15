import { LOSS_LABELS, LOSS_STATUSES, type LossStatus } from '@/domain/types';

import { choose } from './dialogs';

/** Asks what happened to an item. 'remove' takes it out of the claim; null is a cancel. */
export function pickLoss(opts: { current: LossStatus | null; name: string }): Promise<LossStatus | 'remove' | null> {
  return choose<LossStatus | 'remove'>({
    title: opts.current ? `What happened to ${opts.name}?` : `Add ${opts.name} to the claim`,
    message: opts.current ? undefined : 'Say what happened to it. You can add a note after.',
    choices: [
      ...LOSS_STATUSES.map((k) => ({ key: k, label: LOSS_LABELS[k] })),
      ...(opts.current ? [{ key: 'remove' as const, label: 'Take it out of the claim', destructive: true }] : []),
    ],
  });
}
