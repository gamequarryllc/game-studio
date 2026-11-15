import { dbDelete, dbGet, dbPut } from './webdb';

// The web preview's version of files.ts: named text values in IndexedDB.

export async function readText(name: string): Promise<string | null> {
  return (await dbGet<string>('kv', name)) ?? null;
}

export type ReadResult = { kind: 'missing' } | { kind: 'text'; text: string } | { kind: 'error' };

export async function readTextResult(name: string): Promise<ReadResult> {
  try {
    const text = await dbGet<string>('kv', name);
    return typeof text === 'string' ? { kind: 'text', text } : { kind: 'missing' };
  } catch {
    return { kind: 'error' };
  }
}

export async function readPreviousTextResult(_name: string): Promise<ReadResult> {
  return { kind: 'missing' };
}

export async function keepDamagedCopy(name: string, now: number): Promise<void> {
  try {
    const text = await dbGet<string>('kv', name);
    if (typeof text === 'string') await dbPut('kv', `${name}.damaged-${now}`, text);
  } catch {
    // Best effort.
  }
}

export async function readPreviousText(_name: string): Promise<string | null> {
  return null;
}

export async function writeText(name: string, text: string): Promise<void> {
  await dbPut('kv', name, text);
}

export async function removeText(name: string): Promise<void> {
  await dbDelete('kv', name);
}
