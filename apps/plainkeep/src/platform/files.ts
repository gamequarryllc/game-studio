import { Directory, File, Paths } from 'expo-file-system';

// Small named text files in the app's documents folder (iPhone).
// The web preview has its own version of this file: files.web.ts.

function home(): Directory {
  const dir = new Directory(Paths.document, 'plainkeep');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function readIfPresent(file: File): Promise<string | null> {
  try {
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

export async function readText(name: string): Promise<string | null> {
  return readIfPresent(new File(home(), name));
}

/** The copy kept from the save before last, for when the main file is damaged. */
export async function readPreviousText(name: string): Promise<string | null> {
  return readIfPresent(new File(home(), `${name}.bak`));
}

/**
 * Writes the new text beside the old file, keeps the old one as a spare, then
 * swaps the new one in. If the app is killed part-way, one good copy survives.
 */
export async function writeText(name: string, text: string): Promise<void> {
  const dir = home();
  const main = new File(dir, name);
  const next = new File(dir, `${name}.tmp`);
  if (next.exists) next.delete();
  next.create();
  await next.write(text);
  if (main.exists) await main.copy(new File(dir, `${name}.bak`), { overwrite: true });
  await next.move(main, { overwrite: true });
}

export async function removeText(name: string): Promise<void> {
  for (const suffix of ['', '.bak', '.tmp']) {
    const file = new File(home(), `${name}${suffix}`);
    if (file.exists) file.delete();
  }
}
