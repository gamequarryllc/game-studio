import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Getting things out of the app on the iPhone: everything leaves through the
// share sheet, so the person chooses where it goes (Files, Mail, AirDrop).
// The web preview has its own version: exporter.web.ts.

function outbox(): Directory {
  const dir = new Directory(Paths.cache, 'plainpins-out');
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

/** Lets the person choose a file and reads it as text; null when they change their mind. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}
