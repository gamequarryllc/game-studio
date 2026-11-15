import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Getting things out of the app on the iPhone: everything leaves through the
// share sheet, so the person chooses where it goes (Files, Mail, AirDrop).
// The web preview has its own version: exporter.web.ts.

/** True where a report becomes a PDF in the share sheet; false on the web preview. */
export const MAKES_PDF = true;

function outbox(): Directory {
  const dir = new Directory(Paths.cache, 'plainproof-out');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fresh(name: string): File {
  const file = new File(outbox(), name);
  if (file.exists) file.delete();
  return file;
}

async function share(file: File, mimeType: string, UTI: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, UTI });
}

export async function shareTextFile(name: string, mimeType: string, UTI: string, text: string): Promise<void> {
  const file = fresh(name);
  file.create();
  await file.write(text);
  await share(file, mimeType, UTI);
}

/** Nothing to prepare on the iPhone; the web preview opens its tab here. */
export function prepareReport(): unknown {
  return null;
}

export function cancelReport(_target: unknown): void {}

export async function deliverReport(_target: unknown, html: string, baseName: string): Promise<void> {
  const printed = await Print.printToFileAsync({ html });
  const file = fresh(`${baseName}.pdf`);
  await new File(printed.uri).move(file);
  await share(file, 'application/pdf', 'com.adobe.pdf');
}

/** The report as a file to put inside a zip: a PDF on the iPhone. */
export const REPORT_EXT = 'pdf' as const;

export async function renderReportFile(html: string): Promise<Uint8Array> {
  const printed = await Print.printToFileAsync({ html });
  const file = new File(printed.uri);
  try {
    return await file.bytes();
  } finally {
    if (file.exists) file.delete();
  }
}

export interface BackupSink {
  onChunk(chunk: Uint8Array): void;
  /** Puts what has arrived so far on disk. */
  flush(): Promise<void>;
  /** Hands the finished file to the share sheet (or, with keep, only finishes it). Returns where it is. */
  finish(): Promise<string>;
  abort(): Promise<void>;
}

/** A zip being written to a file. With keep, it is not shared: the caller copies it somewhere (iCloud Drive) and drops it. */
export function createBackupSink(name: string, opts: { keep?: boolean } = {}): BackupSink {
  const file = fresh(name);
  file.create();
  let pending: Uint8Array[] = [];
  const flush = async () => {
    const batch = pending;
    pending = [];
    for (const chunk of batch) await file.write(chunk, { append: true });
  };
  return {
    onChunk: (chunk) => {
      pending.push(chunk);
    },
    flush,
    async finish() {
      await flush();
      if (!opts.keep) await share(file, 'application/zip', 'public.zip-archive');
      return file.uri;
    },
    async abort() {
      pending = [];
      if (file.exists) file.delete();
    },
  };
}

export interface PickedBackup {
  name: string;
  /** Reads the file in pieces; `final` is true on the last one. */
  read(onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void): Promise<void>;
}

const READ_SIZE = 512 * 1024;

/** Deletes a file this module made (a kept zip, once it has been copied away). */
export function dropOutboxFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort: the cache folder is emptied by iOS in time anyway.
  }
}

export async function pickBackupFile(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    name: asset.name,
    async read(onChunk) {
      const handle = new File(asset.uri).open(FileMode.ReadOnly);
      try {
        const size = handle.size ?? 0;
        if (size === 0) {
          await onChunk(new Uint8Array(0), true);
          return;
        }
        let done = 0;
        while (done < size) {
          const chunk = await handle.readBytes(Math.min(READ_SIZE, size - done));
          if (chunk.length === 0) break;
          done += chunk.length;
          await onChunk(chunk, done >= size);
        }
      } finally {
        handle.close();
      }
    },
  };
}
