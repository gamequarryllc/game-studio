import * as DocumentPicker from 'expo-document-picker';

// The web preview's version of exporter.ts. There is no share sheet in a
// browser: files download, and the report opens in a new tab to print or save.

export const MAKES_PDF = false;

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function shareTextFile(name: string, mimeType: string, _uti: string, text: string): Promise<void> {
  download(name, new Blob([text], { type: mimeType }));
}

/**
 * Browsers only allow a new tab straight from a tap, so the tab is opened
 * first and filled in once the report is ready.
 */
export function prepareReport(): unknown {
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.write('<!doctype html><title>Home inventory</title><p style="font: 16px system-ui; padding: 24px">Putting the report together…</p>');
  }
  return tab;
}

export function cancelReport(target: unknown): void {
  (target as Window | null)?.close();
}

export async function deliverReport(target: unknown, html: string, baseName: string): Promise<void> {
  const tab = target as Window | null;
  if (tab && !tab.closed) {
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
    return;
  }
  // The tab was blocked: hand the report over as a file instead.
  download(`${baseName}.html`, new Blob([html], { type: 'text/html' }));
}

export interface BackupSink {
  onChunk(chunk: Uint8Array): void;
  flush(): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}

export function createBackupSink(name: string): BackupSink {
  let parts: BlobPart[] = [];
  return {
    onChunk: (chunk) => {
      parts.push(chunk.slice());
    },
    async flush() {},
    async finish() {
      download(name, new Blob(parts, { type: 'application/zip' }));
      parts = [];
    },
    async abort() {
      parts = [];
    },
  };
}

export interface PickedBackup {
  name: string;
  read(onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void): Promise<void>;
}

const READ_SIZE = 512 * 1024;

export async function pickBackupFile(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/zip', '.zip'], multiple: false });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    name: asset.name,
    async read(onChunk) {
      const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
      if (blob.size === 0) {
        await onChunk(new Uint8Array(0), true);
        return;
      }
      for (let at = 0; at < blob.size; at += READ_SIZE) {
        const piece = new Uint8Array(await blob.slice(at, at + READ_SIZE).arrayBuffer());
        await onChunk(piece, at + READ_SIZE >= blob.size);
      }
    },
  };
}
