import type { Planned } from '@/domain/reminders';

// The web preview's stand-in for notify.ts. A browser tab cannot deliver a
// reminder weeks from now, so nothing is scheduled; the app still shows what
// the iPhone would have waiting.

export const DELIVERS = false;

export type Permission = 'granted' | 'denied' | 'undetermined';

export interface OpenTarget {
  jobId: string | null;
  thingId: string | null;
}

export async function permission(): Promise<Permission> {
  return 'granted';
}

export async function askPermission(): Promise<Permission> {
  return 'granted';
}

export function openSystemSettings(): void {}

export function applyPlan(_plan: Planned[]): Promise<void> {
  return Promise.resolve();
}

export function onReminderOpened(_handler: (target: OpenTarget) => void): () => void {
  return () => {};
}
