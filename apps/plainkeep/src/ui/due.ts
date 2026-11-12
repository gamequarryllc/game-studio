import { groupDigits, spanParts } from '@/domain/labels';
import type { Due } from '@/domain/schedule';
import type { DistanceUnit } from '@/domain/types';

import type { Tone } from './theme';

// How a due date is shown: its colour, and the figure on the right of a job's line.

export function dueTone(due: Due): Tone {
  switch (due.state) {
    case 'overdue':
      return 'red';
    case 'today':
    case 'soon':
      return 'amber';
    case 'later':
      return 'blue';
    default:
      return 'muted';
  }
}

export interface Readout {
  figure: string;
  unit: string;
}

/** The figure for a job's line: what is left of whichever limit comes first. */
export function readoutOf(due: Due, unit: DistanceUnit): Readout | null {
  if (due.state === 'paused' || due.state === 'finished') return null;
  const dateOver = due.daysLeft !== null && due.daysLeft < 0;
  const distOver = due.distanceLeft !== null && due.distanceLeft < 0;
  const useDistance = due.distanceLeft !== null && (due.daysLeft === null || (distOver && !dateOver) || (!dateOver && due.by === 'distance'));
  if (useDistance && due.distanceLeft !== null) {
    if (due.distanceLeft === 0) return { figure: 'Now', unit: 'due' };
    return { figure: groupDigits(Math.abs(due.distanceLeft)), unit: due.distanceLeft < 0 ? `${unit} over` : unit };
  }
  if (due.daysLeft !== null) {
    if (due.daysLeft === 0) return { figure: 'Today', unit: 'due' };
    const parts = spanParts(due.daysLeft);
    return { figure: parts.figure, unit: due.daysLeft < 0 ? `${parts.unit} over` : parts.unit };
  }
  return null;
}
