import { addItem, addPolicyDocuments, addRoomVideo, addRooms, emptyDraft, setItemLoss, updateClaim, updateProfile } from '../actions';
import { BACKUP_VIDEO_BUDGET, concat, createBackupReader, fileEntryName, isAttachmentName, parseFileEntryName, writeBackup, type PhotoSize } from '../backup';
import { claimPackageName, claimPackagePlan, safeName } from '../claimPackage';
import { emptyDoc } from '../doc';
import { currentDoc, libraryFileNames, libraryOf } from '../library';
import { buildReportHtml, videoLine } from '../report';
import { claimSummary, formatBytes, formatDuration, lossCountLine } from '../selectors';
import type { Doc, Video } from '../types';

const NOW = new Date(2026, 10, 15, 9, 0).getTime();

function video(id: string, bytes: number, ms: number | null = 61_000): Video {
  return { id, durationMs: ms, bytes, takenAt: NOW - 3_600_000, addedAt: NOW, ext: 'mov' };
}

function home(): Doc {
  let doc = addRooms(emptyDoc(NOW), [{ name: 'Living room', icon: 'sofa' }, { name: 'Bed/room: "main"', icon: 'bed' }], NOW);
  doc = updateProfile(doc, { homeName: 'Fern Cottage', ownerName: 'Sam Reyes', insurer: 'Northfield Mutual' });
  const [lr, bed] = doc.rooms.map((r) => r.id);
  const tv = { ...emptyDraft(lr), name: 'Television', valueCents: 150000, photos: [{ id: 'tvphoto1', width: 1, height: 1, takenAt: null, addedAt: NOW }], receipts: [{ id: 'tvrcpt01', width: 1, height: 1, takenAt: null, addedAt: NOW }] };
  doc = addItem(doc, tv, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(bed), name: 'Ring', valueCents: 600000 }, NOW).doc;
  doc = addItem(doc, { ...emptyDraft(bed), name: 'Lamp' }, NOW).doc;
  doc = addRoomVideo(doc, lr, video('vidlr001', 40_000_000));
  doc = addRoomVideo(doc, bed, video('vidbed01', 30_000_000));
  doc = addPolicyDocuments(doc, [
    { id: 'policy01', name: 'Policy.pdf', kind: 'pdf', bytes: 120_000, addedAt: NOW },
    { id: 'policy02', name: 'Policy', kind: 'pdf', bytes: 100_000, addedAt: NOW },
    { id: 'page0001', name: 'Policy page 1', kind: 'image', bytes: 900_000, addedAt: NOW },
  ]);
  return doc;
}

describe('claim summary', () => {
  it('counts, totals and names what happened', () => {
    let doc = home();
    doc = setItemLoss(doc, doc.items[0].id, 'stolen', 'Taken from the stand', NOW);
    doc = setItemLoss(doc, doc.items[2].id, 'damaged', undefined, NOW);
    const s = claimSummary(doc);
    expect(s.count).toBe(2);
    expect(s.totalCents).toBe(150000);
    expect(s.unvalued).toBe(1);
    expect(lossCountLine(s.byStatus)).toBe('1 stolen · 1 damaged');
  });
});

describe('claim package', () => {
  function claimed(): Doc {
    let doc = home();
    doc = setItemLoss(doc, doc.items[0].id, 'stolen', 'Taken from the stand', NOW);
    doc = updateClaim(doc, { claimNumber: 'CL-77', lossDate: '2026-11-14', cause: 'theft', description: 'Back door forced.' }, NOW);
    return doc;
  }

  it('puts the schedule, the spreadsheet, a read-me and each claimed item’s photos in folders', () => {
    const plan = claimPackagePlan(claimed(), { generatedAt: NOW, reportExt: 'pdf', appVersion: '1.0.1' });
    const paths = plan.map((e) => e.path);
    expect(paths.slice(0, 3)).toEqual(['Schedule of loss.pdf', 'Schedule of loss.csv', 'Read me.txt']);
    expect(paths).toContain('Items/01 Living room - Television/Photo 1.jpg');
    expect(paths).toContain('Items/01 Living room - Television/Receipt 1.jpg');
    // Only rooms with a claimed item send their video.
    expect(paths).toContain('Videos/Living room walk-through 1.mov');
    expect(paths.some((p) => p.includes('Bed'))).toBe(false);
    // Policy documents keep their names, made unique, with the right ending.
    expect(paths.filter((p) => p.startsWith('Policy/'))).toEqual(['Policy/Policy.pdf', 'Policy/Policy (2).pdf', 'Policy/Policy page 1.jpg']);
    expect(plan.find((e) => e.path === 'Policy/Policy page 1.jpg')?.source).toEqual({ kind: 'file', name: 'page0001.jpg' });
  });

  it('writes a read-me with the claim and the notes, with Windows line ends', () => {
    const plan = claimPackagePlan(claimed(), { generatedAt: NOW, reportExt: 'html' });
    const readMe = plan.find((e) => e.path === 'Read me.txt');
    const text = readMe?.source.kind === 'text' ? readMe.source.text : '';
    expect(text).toContain('Claim number: CL-77\r\n');
    expect(text).toContain('Cause: Theft or break-in');
    expect(text).toContain('Items: 1 (1 stolen)');
    expect(text).toContain('Schedule of loss.html');
    expect(text).toContain('Back door forced.');
    expect(text).toContain('- Television (Stolen): Taken from the stand');
    expect(text.split('\n').every((l, i, all) => i === all.length - 1 || l.endsWith('\r'))).toBe(true);
  });

  it('makes names safe for any computer', () => {
    expect(safeName('Bed/room: "main"')).toBe('Bed room main');
    expect(safeName('  ..hidden  ')).toBe('hidden');
    expect(safeName('')).toBe('Untitled');
    expect(safeName('x'.repeat(100)).length).toBe(60);
    expect(claimPackageName(home(), NOW)).toBe('Fern-Cottage-claim-package-2026-11-15');
  });
});

describe('videos and documents in backups', () => {
  const files: Record<string, Uint8Array> = {
    'vidlr001.mov': new Uint8Array(300_000).fill(3),
    'vidbed01.mov': new Uint8Array(200_000).fill(4),
    'policy01.pdf': new Uint8Array([37, 80, 68, 70]),
    'page0001.jpg': new Uint8Array([255, 216, 255]),
  };
  const source = {
    readPhoto: async (_id: string, _size: PhotoSize) => new Uint8Array([1, 2, 3]),
    // Handed over in pieces, as the phone reads a large file.
    readFile: async (name: string, onChunk: (chunk: Uint8Array, final: boolean) => Promise<void> | void) => {
      const data = files[name];
      if (!data) return false;
      for (let at = 0; at < data.length; at += 65_536) await onChunk(data.subarray(at, at + 65_536), at + 65_536 >= data.length);
      return true;
    },
  };

  it('names files safely', () => {
    expect(isAttachmentName('abcd1234.mov')).toBe(true);
    expect(isAttachmentName('abcd1234.exe')).toBe(false);
    expect(isAttachmentName('../etc.pdf')).toBe(false);
    expect(fileEntryName('abcd1234.pdf')).toBe('files/abcd1234.pdf');
    expect(parseFileEntryName('files/abcd1234.pdf')).toBe('abcd1234.pdf');
    expect(parseFileEntryName('files/../x.pdf')).toBeNull();
    expect(parseFileEntryName('photos/abcd1234.jpg')).toBeNull();
  });

  it('streams every video and document in and back out, piece by piece', async () => {
    const doc = home();
    expect([...libraryFileNames(libraryOf(doc))].sort()).toEqual(['page0001.jpg', 'policy01.pdf', 'policy02.pdf', 'vidbed01.mov', 'vidlr001.mov']);
    const chunks: Uint8Array[] = [];
    const result = await writeBackup(libraryOf(doc), source, { now: NOW, appVersion: '1', onChunk: (c) => chunks.push(c) });
    expect(result).toMatchObject({ files: 4, missingFiles: 1, skippedVideos: 0 });
    const bytes = concat(chunks);
    const got: Record<string, Uint8Array[]> = {};
    const finals: string[] = [];
    const reader = createBackupReader(
      NOW,
      () => {},
      (name) => (chunk, final) => {
        (got[name] ??= []).push(chunk.slice());
        if (final) finals.push(name);
      },
    );
    for (let at = 0; at < bytes.length; at += 50_000) reader.push(bytes.subarray(at, at + 50_000), at + 50_000 >= bytes.length);
    const library = reader.finish();
    expect(currentDoc(library).rooms[0].videos).toHaveLength(1);
    expect(finals.sort()).toEqual(['page0001.jpg', 'policy01.pdf', 'vidbed01.mov', 'vidlr001.mov']);
    for (const name of finals) expect(concat(got[name])).toEqual(files[name]);
    // The video came over in more than one piece: it never had to sit in memory whole.
    expect(got['vidlr001.mov'].length).toBeGreaterThan(1);
  });

  it('leaves out videos that would take the backup past what a zip can hold, smallest kept first', async () => {
    const chunks: Uint8Array[] = [];
    const result = await writeBackup(libraryOf(home()), source, { now: NOW, appVersion: '1', onChunk: (c) => chunks.push(c), videoBudget: 35_000_000 });
    // The 30 MB bedroom video fits; the 40 MB living-room one would not.
    expect(result).toMatchObject({ skippedVideos: 1, files: 3 });
    expect(BACKUP_VIDEO_BUDGET).toBeLessThan(4 * 1024 ** 3);
  });

  it('reads an older backup with no files in it, and skips files when nobody takes them', async () => {
    const chunks: Uint8Array[] = [];
    await writeBackup(libraryOf(home()), source, { now: NOW, appVersion: '1', onChunk: (c) => chunks.push(c) });
    const reader = createBackupReader(NOW, () => {});
    const bytes = concat(chunks);
    reader.push(bytes, true);
    expect(currentDoc(reader.finish()).policy.documents).toHaveLength(3);
  });
});

describe('report and formats', () => {
  it('says what each room’s walk-through video holds', () => {
    expect(videoLine([video('a', 1, 61_000), video('b', 1, 120_000)])).toBe(
      'Walk-through video: 2 videos, 3:01 in all, recorded Nov 15, 2026. Kept in Plainproof; sent with a claim package.',
    );
    expect(videoLine([video('a', 1, null)])).toBe('Walk-through video: 1 video, recorded Nov 15, 2026. Kept in Plainproof; sent with a claim package.');
    const html = buildReportHtml(home(), { includePhotos: false, includeReceipts: false, generatedAt: NOW });
    expect(html).toContain('Walk-through video: 1 video, 1:01');
  });

  it('writes sizes and lengths the way Files does', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(820_000)).toBe('820 KB');
    expect(formatBytes(4_250_000)).toBe('4.3 MB');
    expect(formatBytes(142_000_000)).toBe('142 MB');
    expect(formatBytes(1_300_000_000)).toBe('1.3 GB');
    expect(formatDuration(42_000)).toBe('0:42');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('');
  });
});
