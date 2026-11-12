import { groupDigits, spanParts } from '@/domain/labels';
import type { Due, Listed } from '@/domain/schedule';
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

/** Whether the odometer, rather than the calendar, is the limit to show: it is past, or it will be reached first. */
export function leadsByDistance(due: Due): boolean {
  const dateOver = due.daysLeft !== null && due.daysLeft < 0;
  const distOver = due.distanceLeft !== null && due.distanceLeft < 0;
  return due.distanceLeft !== null && (due.daysLeft === null || (distOver && !dateOver) || (!dateOver && due.by === 'distance'));
}

/**
 * The figure for a job: what is left of whichever limit comes first. On a list the unit is bare ("days"):
 * the group it is in and its colour already say which way. On the job's own card it says so ("days left").
 */
export function readoutOf(due: Due, unit: DistanceUnit, direction = false): Readout | null {
  if (due.state === 'paused' || due.state === 'finished' || due.state === 'unlogged') return null;
  const useDistance = leadsByDistance(due);
  if (useDistance && due.distanceLeft !== null) {
    if (due.distanceLeft === 0) return { figure: 'Now', unit: 'due' };
    return { figure: groupDigits(Math.abs(due.distanceLeft)), unit: direction ? (due.distanceLeft < 0 ? `${unit} overdue` : `${unit} left`) : unit };
  }
  if (due.daysLeft !== null) {
    if (due.daysLeft === 0) return { figure: 'Today', unit: 'due' };
    const parts = spanParts(due.daysLeft);
    return { figure: parts.figure, unit: direction ? (due.daysLeft < 0 ? `${parts.unit} overdue` : `${parts.unit} left`) : parts.unit };
  }
  return null;
}

/** How a thing stands: the colour of its most pressing job. Used for its symbol wherever it is shown. */
export function standing(jobs: Listed[]): Tone {
  const live = jobs.filter((j) => j.due.state !== 'paused' && j.due.state !== 'finished');
  if (live.some((j) => j.due.state === 'overdue')) return 'red';
  if (live.some((j) => j.due.state === 'today' || j.due.state === 'soon')) return 'amber';
  return live.length === 0 ? 'muted' : 'blue';
}
