import * as DocumentPicker from 'expo-document-picker';

// The web preview's version of exporter.ts. There is no share sheet in a
// browser: files download, and the service record opens in a new tab to print.

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

/** Browsers only allow a new tab straight from a tap, so the tab is opened first and filled in once the record is ready. */
export function prepareReport(): unknown {
  const tab = window.open('', '_blank');
  if (tab) tab.document.write('<!doctype html><title>Service record</title><p style="font: 16px system-ui; padding: 24px">Putting the record together…</p>');
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
  // The tab was blocked: hand the record over as a file instead.
  download(`${baseName}.html`, new Blob([html], { type: 'text/html' }));
}

export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '.json'], multiple: false });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  return { name: asset.name, text: await blob.text() };
}
