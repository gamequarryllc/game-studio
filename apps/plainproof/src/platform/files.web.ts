import { dbDelete, dbGet, dbPut } from './webdb';

// The web preview's version of files.ts: named text values in IndexedDB.

export async function readText(name: string): Promise<string | null> {
  return (await dbGet<string>('kv', name)) ?? null;
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
