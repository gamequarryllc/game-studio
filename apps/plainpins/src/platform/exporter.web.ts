import * as DocumentPicker from 'expo-document-picker';

// The web preview's version of exporter.ts. There is no share sheet in a
// browser, so files download.

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

export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '.json'], multiple: false });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  return { name: asset.name, text: await blob.text() };
}
