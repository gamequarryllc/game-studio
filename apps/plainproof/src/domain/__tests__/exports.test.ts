import { addItem, addRooms, emptyDraft, updateProfile } from '../actions';
import {
  MANIFEST_NAME,
  backupFileName,
  buildManifest,
  concat,
  createBackupReader,
  createZipWriter,
  parseManifest,
  parsePhotoEntryName,
  photoEntryName,
  textToBytes,
  writeBackup,
  type PhotoSize,
} from '../backup';
import { buildCsv, csvCell } from '../csv';
import { DocError, emptyDoc } from '../doc';
import { buildReportHtml, cssText, escapeHtml, moneyColumnEm, pageFootCss, reportFileName, reportPhotoIds } from '../report';
import { sampleHome } from '../sample';
import type { Doc } from '../types';

const NOW = new Date(2026, 10, 11, 10, 30).getTime();
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';

function home(): Doc {
  let doc = addRooms(emptyDoc(NOW), [{ name: 'Kitchen', icon: 'kitchen' }, { name: 'Empty room', icon: 'box' }], NOW);
  doc = updateProfile(doc, { homeName: 'Fern Cottage', ownerName: 'A <b>bold</b> owner', policyNumber: 'P&C-1' });
  const a = emptyDraft(doc.rooms[0].id);
  a.name = 'Mixer <script>alert(1)</script>';
  a.valueCents = 44900;
  a.quantity = 2;
  a.brand = 'Carrow';
  a.model = 'Artisan "5"';
  a.serial = 'SN-123';
  a.purchaseDate = '2021-03-04';
  a.purchasedFrom = 'Larder & Hearth';
  a.pricePaidCents = 39900;
  a.notes = '=SUM(A1:A9)\nSecond line, with a comma';
  a.photos = [{ id: 'photo0001', width: 400, height: 300 }];
  a.receipts = [{ id: 'rcpt00001', width: 300, height: 600 }];
  doc = addItem(doc, a, NOW).doc;
  const b = emptyDraft(doc.rooms[0].id);
  b.name = 'Unvalued thing';
  doc = addItem(doc, b, NOW).doc;
  return doc;
}

describe('the report', () => {
  const doc = home();
  const html = buildReportHtml(doc, {
    includePhotos: true,
    includeReceipts: true,
    generatedAt: NOW,
    photoData: { photo0001: PIXEL, rcpt00001: PIXEL },
  });

  it('escapes everything the owner typed', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Mixer &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; owner');
    expect(html).toContain('P&amp;C-1');
    expect(html).toContain('Artisan &quot;5&quot;');
    expect(html).toContain('Larder &amp; Hearth');
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('shows the totals, the date and each item', () => {
    expect(html).toContain('Fern Cottage');
    expect(html).toContain('Nov 11, 2026');
    expect(html).toContain('$898.00'); // 2 x $449.00, the only valued item
    expect(html).toContain('$449.00');
    expect(html).toContain('Serial no. <b>SN-123</b>');
    expect(html).toContain('Mar 4, 2021');
    expect(html).toContain('Paid $399.00');
    expect(html).toContain('No value');
    expect(html).not.toContain('Not valued');
    expect(html).toContain('Second line, with a comma');
  });

  it('leaves out rooms with nothing in them', () => {
    expect(html).not.toContain('Empty room');
  });

  it('embeds photos and receipts only as image data', () => {
    expect(html.split(PIXEL).length - 1).toBe(2);
    const evil = buildReportHtml(doc, {
      includePhotos: true,
      includeReceipts: true,
      generatedAt: NOW,
      photoData: { photo0001: 'javascript:alert(1)', rcpt00001: 'data:text/html;base64,AAAA' },
    });
    expect(evil).not.toContain('javascript:');
    expect(evil).not.toContain('data:text/html');
    expect(evil).toContain('No photo');
  });

  it('can leave photos and receipts out', () => {
    const plain = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW });
    expect(plain).not.toContain('<img');
    expect(plain).not.toContain('>Photo<');
    expect(plain).toContain('Receipt kept');
    expect(reportPhotoIds(doc, { includePhotos: false, includeReceipts: false })).toEqual({ thumbs: [], full: [] });
    expect(reportPhotoIds(doc, { includePhotos: true, includeReceipts: true })).toEqual({ thumbs: ['photo0001'], full: ['rcpt00001'] });
  });

  it('says so when the inventory is empty', () => {
    const empty = buildReportHtml(emptyDoc(NOW), { includePhotos: true, includeReceipts: true, generatedAt: NOW });
    expect(empty).toContain('Nothing has been added');
    expect(empty).toContain('Home inventory');
  });

  it('handles the whole sample home', () => {
    const sample = sampleHome(NOW);
    const out = buildReportHtml(sample, { includePhotos: true, includeReceipts: false, generatedAt: NOW });
    for (const item of sample.items) expect(out).toContain(escapeHtml(item.name));
    expect(out.match(/<h2 /g)!.length).toBe(1 + sample.rooms.length);
  });

  it('names the file after the home and the day', () => {
    expect(reportFileName(doc, NOW)).toBe('Fern-Cottage-2026-11-11');
    expect(reportFileName(emptyDoc(NOW), NOW)).toBe('Home-inventory-2026-11-11');
    expect(reportFileName(updateProfile(doc, { homeName: '../../etc' }), NOW)).toBe('etc-2026-11-11');
  });
});

describe('the spreadsheet', () => {
  it('quotes cells and defuses formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5', false)).toBe('-5');
  });

  it('has one row per item with exact amounts', () => {
    const csv = buildCsv(home());
    const rows = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(rows[0].split(',')).toHaveLength(15);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('449.00,898.00,399.00,2021-03-04');
    expect(csv).toContain('"\'=SUM(A1:A9)\nSecond line, with a comma"');
    expect(csv).toContain('Kitchen,Unvalued thing,,1,,,,,,,,,,0,0');
  });
});

describe('backups', () => {
  const doc = home();
  const files: Record<string, Uint8Array> = {
    'photo0001:full': new Uint8Array([1, 2, 3, 4, 5]),
    'photo0001:thumb': new Uint8Array([9, 9]),
    'rcpt00001:full': new Uint8Array(70_000).fill(7),
  };
  const source = { readPhoto: async (id: string, size: PhotoSize) => files[`${id}:${size}`] ?? null };

  async function makeBackup(d: Doc = doc) {
    const chunks: Uint8Array[] = [];
    const result = await writeBackup(d, source, { now: NOW, appVersion: '0.1.0', onChunk: (c) => chunks.push(c) });
    return { bytes: concat(chunks), result };
  }

  function restore(bytes: Uint8Array, chunkSize: number) {
    const photos: Record<string, Uint8Array> = {};
    const reader = createBackupReader(NOW, (id, size, data) => {
      photos[`${id}:${size}`] = data;
    });
    for (let at = 0; at < bytes.length; at += chunkSize) {
      reader.push(bytes.subarray(at, at + chunkSize), at + chunkSize >= bytes.length);
    }
    return { doc: reader.finish(), photos };
  }

  it('names photo files safely', () => {
    expect(photoEntryName('abc12345', 'full')).toBe('photos/abc12345.jpg');
    expect(parsePhotoEntryName('photos/abc12345_t.jpg')).toEqual({ id: 'abc12345', size: 'thumb' });
    expect(parsePhotoEntryName('photos/../../x.jpg')).toBeNull();
    expect(parsePhotoEntryName('photos/abc.png')).toBeNull();
    expect(backupFileName(NOW)).toBe('Plainproof-backup-2026-11-11.zip');
  });

  it('round-trips the document and every photo, whatever the chunk size', async () => {
    const { bytes, result } = await makeBackup();
    expect(result).toEqual({ photos: 2, missing: 0 });
    for (const chunkSize of [bytes.length, 4096, 7]) {
      const back = restore(bytes, chunkSize);
      expect(back.doc).toEqual({ ...doc, meta: { ...doc.meta, onboarded: true } });
      expect(Object.keys(back.photos).sort()).toEqual(['photo0001:full', 'photo0001:thumb', 'rcpt00001:full']);
      expect(Array.from(back.photos['photo0001:full'])).toEqual([1, 2, 3, 4, 5]);
      expect(back.photos['rcpt00001:full']).toHaveLength(70_000);
    }
  });

  it('counts photos whose files have gone missing and carries on', async () => {
    const d = home();
    d.items[0].photos.push({ id: 'vanished1', width: 1, height: 1 });
    const { result, bytes } = await makeBackup(d);
    expect(result).toEqual({ photos: 2, missing: 1 });
    expect(restore(bytes, 1000).doc.items[0].photos).toHaveLength(2);
  });

  it('refuses files that are not a backup', () => {
    expect(() => restore(textToBytes('hello, this is just some text that is not a zip file at all'), 16)).toThrow(DocError);
    const chunks: Uint8Array[] = [];
    const zip = createZipWriter((c) => chunks.push(c));
    zip.add('something-else.txt', textToBytes('hi'));
    zip.end();
    expect(() => restore(concat(chunks), 64)).toThrow(DocError);
  });

  it('refuses a backup from a newer version and one with the wrong marker', () => {
    expect(() => parseManifest(JSON.stringify({ format: 'plainproof-backup', formatVersion: 9, doc }), NOW)).toThrow(/newer version/);
    expect(() => parseManifest(JSON.stringify({ format: 'other', doc }), NOW)).toThrow(DocError);
    expect(() => parseManifest('{', NOW)).toThrow(DocError);
    expect(parseManifest(buildManifest(doc, NOW, '0.1.0'), NOW).items).toHaveLength(2);
    expect(MANIFEST_NAME).toBe('plainproof.json');
  });
});

describe('the report columns', () => {
  const tables = (page: string) => page.match(/<table class="list items">.*?<\/table>/g) ?? [];
  const colgroup = (table: string | undefined) => table?.match(/<colgroup>.*?<\/colgroup>/)?.[0];

  it('gives every room the same columns (they used to shift from room to room)', () => {
    const page = buildReportHtml(sampleHome(NOW), { includePhotos: true, includeReceipts: false, generatedAt: NOW });
    const found = tables(page);
    expect(found.length).toBeGreaterThan(3);
    const first = colgroup(found[0]);
    expect(first).toContain('<col class="c-photo">');
    for (const table of found) expect(colgroup(table)).toBe(first);
  });

  it('leaves the photo column out when photos are off', () => {
    const page = buildReportHtml(sampleHome(NOW), { includePhotos: false, includeReceipts: false, generatedAt: NOW });
    expect(colgroup(tables(page)[0])).not.toContain('c-photo');
    expect(page).not.toContain('<th class="photo">');
  });

  it('sizes the money columns from the longest amount, so Each and Total never touch', () => {
    expect(moneyColumnEm([])).toBe(moneyColumnEm(['$5.00']));
    const everyday = moneyColumnEm(['$1,899.00', '$449.00']);
    const huge = moneyColumnEm(['$999,999,999.99', '$1,999,999,999.98']);
    expect(huge).toBeGreaterThan(everyday);
    expect(huge).toBeGreaterThanOrEqual('$1,999,999,999.98'.length * 0.6);

    let doc = addRooms(emptyDoc(NOW), [{ name: 'Vault', icon: 'box' }], NOW);
    const draft = emptyDraft(doc.rooms[0].id);
    draft.name = 'Bullion';
    draft.valueCents = 99999999999;
    draft.quantity = 2;
    doc = addItem(doc, draft, NOW).doc;
    const page = buildReportHtml(doc, { includePhotos: true, includeReceipts: false, generatedAt: NOW });
    expect(page).toContain(`<col style="width:${huge}em"><col style="width:${huge}em">`);
    expect(page).toContain('padding-left: 8pt');
  });
});

describe('the foot of each report page', () => {
  it('names the home, the date and the page', () => {
    const css = pageFootCss('Fern Cottage', 'Nov 11, 2026');
    expect(css).toContain('@bottom-left { content: "Fern Cottage · Prepared Nov 11, 2026";');
    expect(css).toContain('content: "Page " counter(page) " of " counter(pages);');
  });

  it('cannot be broken out of by a home name', () => {
    const nasty = 'Mill "House" </style><script>alert(1)</script> \\ } body { display: none';
    expect(cssText(nasty)).not.toMatch(/["<>{}\\]/);
    let doc = addRooms(emptyDoc(NOW), [{ name: 'Hall', icon: 'hall' }], NOW);
    doc = updateProfile(doc, { homeName: nasty });
    const page = buildReportHtml(doc, { includePhotos: false, includeReceipts: false, generatedAt: NOW });
    expect(page.match(/<\/style>/g)).toHaveLength(1);
    expect(page).not.toContain('<script>');
  });

  it('puts the summary’s Items column beside Value', () => {
    const page = buildReportHtml(sampleHome(NOW), { includePhotos: true, includeReceipts: false, generatedAt: NOW });
    expect(page).toMatch(/<table class="list summary"><colgroup><col><col class="c-count"><col style="width:[\d.]+em"><\/colgroup>/);
  });
});

describe('empty cells in the report', () => {
  it('are a quiet dash, not the same words down the column', () => {
    const page = buildReportHtml(sampleHome(NOW), { includePhotos: true, includeReceipts: false, generatedAt: NOW });
    expect(page).not.toContain('>Not recorded<');
    expect(page).toContain('<span class="muted" title="Not recorded">—</span>');
  });
});
