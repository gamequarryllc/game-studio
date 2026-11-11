import { displayTime, displayYmd } from './dates';
import { formatMoney } from './money';
import { homeSummary, itemTotalCents, plural, roomSummaries, unitCents } from './selectors';
import { CATEGORY_LABELS, type Doc, type Item } from './types';

// The insurance report. This builds one self-contained HTML page; on the
// phone it is turned into a PDF, on the web preview it opens in a new tab.

export interface ReportOptions {
  includePhotos: boolean;
  includeReceipts: boolean;
  /** When the report was made (ms). */
  generatedAt: number;
  /** Photo id to a data: URI. Photos that are missing here are simply left out. */
  photoData?: Record<string, string>;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lines(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

/** Only image data URIs are ever written into the page. */
function safeImage(uri: string | undefined): string | null {
  return uri && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null;
}

const CSS = `
  @page { margin: 15mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #1b1a17; font: 10.5pt/1.42 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .serif { font-family: "New York", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; }
  .kicker { font-size: 8.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: #1e5b48; font-weight: 600; }
  h1 { font-size: 26pt; line-height: 1.12; margin: 4pt 0 14pt; font-weight: 600; letter-spacing: -0.01em; }
  .who { width: 100%; border-collapse: collapse; margin: 0 0 16pt; }
  .who td { vertical-align: top; padding: 5pt 12pt 5pt 0; width: 50%; border-top: 0.75pt solid #d8d2c4; }
  .who .label { display: block; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b675e; }
  .totals { display: table; width: 100%; border: 1pt solid #1e5b48; border-radius: 3pt; margin: 0 0 18pt; }
  .totals div { display: table-cell; padding: 9pt 12pt; width: 33.33%; border-left: 0.75pt solid #c9d9d2; }
  .totals div:first-child { border-left: 0; background: #eef4f1; width: 40%; }
  .totals .label { display: block; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #46635a; }
  .totals .figure { font-size: 17pt; font-weight: 600; font-variant-numeric: tabular-nums; }
  h2 { font-size: 14.5pt; margin: 22pt 0 2pt; font-weight: 600; page-break-after: avoid; }
  .sub { color: #6b675e; font-size: 9.5pt; margin: 0 0 7pt; page-break-after: avoid; }
  table.list { width: 100%; border-collapse: collapse; }
  table.items { table-layout: fixed; }
  table.items td { overflow-wrap: anywhere; }
  col.c-photo { width: 62pt; }
  col.c-purchase { width: 23%; }
  col.c-qty { width: 34pt; }
  col.c-count { width: 48pt; }
  table.summary { table-layout: fixed; }
  table.summary .qty { padding-right: 0; }
  table.list th { text-align: left; font-size: 8pt; letter-spacing: 0.07em; text-transform: uppercase; color: #6b675e; font-weight: 600; padding: 4pt 6pt 4pt 0; border-bottom: 1pt solid #1b1a17; }
  table.list td { vertical-align: top; padding: 7pt 6pt 7pt 0; border-bottom: 0.75pt solid #d8d2c4; }
  table.list tr { page-break-inside: avoid; }
  table.list .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-right: 0; padding-left: 8pt; }
  table.list th.num { padding-right: 0; }
  table.list .qty { text-align: right; padding-right: 10pt; font-variant-numeric: tabular-nums; }
  table.list tfoot td { border-bottom: 0; border-top: 1pt solid #1b1a17; font-weight: 600; padding-top: 6pt; }
  .photo { width: 62pt; }
  .photo img { display: block; width: 54pt; height: 54pt; object-fit: cover; border-radius: 2pt; border: 0.5pt solid #d8d2c4; }
  .photo .none { width: 54pt; height: 54pt; border: 0.75pt dashed #c9c2b2; border-radius: 2pt; color: #a19c90; font-size: 7pt; text-align: center; line-height: 54pt; }
  .name { font-weight: 600; }
  .detail { color: #45423b; font-size: 9.5pt; }
  .detail b { font-weight: 600; color: #1b1a17; }
  .muted { color: #6b675e; }
  .note { color: #45423b; font-size: 9pt; margin-top: 2pt; }
  .receipts { page-break-before: always; }
  .receipt { page-break-inside: avoid; margin: 0 0 14pt; }
  .receipt img { display: block; max-width: 100%; max-height: 190mm; border: 0.5pt solid #d8d2c4; margin-top: 4pt; }
  .closing { margin-top: 22pt; padding-top: 8pt; border-top: 0.75pt solid #d8d2c4; color: #6b675e; font-size: 8.5pt; }
`;

function itemCell(item: Item): string {
  const parts: string[] = [`<div class="name">${escapeHtml(item.name)}</div>`];
  const makeModel = [item.brand, item.model].filter(Boolean).map(escapeHtml).join(' ');
  const facts: string[] = [];
  if (makeModel) facts.push(makeModel);
  if (item.category) facts.push(escapeHtml(CATEGORY_LABELS[item.category]));
  if (facts.length) parts.push(`<div class="detail">${facts.join(' · ')}</div>`);
  if (item.serial) parts.push(`<div class="detail">Serial no. <b>${escapeHtml(item.serial)}</b></div>`);
  if (item.notes) parts.push(`<div class="note">${lines(item.notes)}</div>`);
  return parts.join('');
}

function purchaseCell(item: Item, currency: string): string {
  const parts: string[] = [];
  if (item.purchaseDate) parts.push(escapeHtml(displayYmd(item.purchaseDate)));
  if (item.purchasedFrom) parts.push(escapeHtml(item.purchasedFrom));
  if (item.pricePaidCents !== null) parts.push(`Paid ${escapeHtml(formatMoney(item.pricePaidCents, currency))}`);
  if (item.receipts.length > 0) parts.push(item.receipts.length === 1 ? 'Receipt kept' : `${item.receipts.length} receipts kept`);
  return parts.length ? parts.join('<br>') : '<span class="muted">Not recorded</span>';
}

/**
 * How wide a money column must be, in em, to hold the longest amount in it
 * without wrapping. A digit is a little over half an em wide; the extra is
 * the gap between columns.
 */
export function moneyColumnEm(amounts: string[]): number {
  const longest = amounts.reduce((n, text) => Math.max(n, text.length), 'No value'.length);
  return Math.round((longest * 0.6 + 1) * 10) / 10;
}

/** Text that is safe inside a quoted CSS string in the page's own style sheet. */
export function cssText(text: string): string {
  return text.replace(/[\\"<>{}\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The foot of every page: whose inventory, when it was prepared, and the page
 * number. Browsers that print page margins draw it (the web preview does).
 * WebKit, which makes the PDF on the iPhone, has not drawn page-margin text,
 * so there the foot is expected to be absent until it is checked on a phone.
 */
export function pageFootCss(title: string, prepared: string): string {
  const foot = 'font: 8pt -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #6b675e;';
  return (
    `@page { @bottom-left { content: "${cssText(title)} · Prepared ${cssText(prepared)}"; ${foot} } ` +
    `@bottom-right { content: "Page " counter(page) " of " counter(pages); ${foot} } }`
  );
}

export function reportTitle(doc: Doc): string {
  return doc.profile.homeName || 'Home inventory';
}

export function buildReportHtml(doc: Doc, opts: ReportOptions): string {
  const currency = doc.settings.currency;
  const money = (cents: number) => escapeHtml(formatMoney(cents, currency));
  const summary = homeSummary(doc);
  const rooms = roomSummaries(doc);
  const photoData = opts.photoData ?? {};
  const out: string[] = [];

  out.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  out.push(`<title>${escapeHtml(reportTitle(doc))}: home inventory</title>`);
  out.push(`<style>${CSS}${pageFootCss(reportTitle(doc), displayTime(opts.generatedAt))}</style></head><body>`);

  out.push('<div class="kicker">Home inventory</div>');
  out.push(`<h1 class="serif">${escapeHtml(reportTitle(doc))}</h1>`);

  const who: [string, string][] = [];
  if (doc.profile.ownerName) who.push(['Prepared for', escapeHtml(doc.profile.ownerName)]);
  if (doc.profile.address) who.push(['Address', lines(doc.profile.address)]);
  if (doc.profile.insurer) who.push(['Insurer', escapeHtml(doc.profile.insurer)]);
  if (doc.profile.policyNumber) who.push(['Policy number', escapeHtml(doc.profile.policyNumber)]);
  who.push(['Date prepared', escapeHtml(displayTime(opts.generatedAt))]);
  out.push('<table class="who">');
  for (let i = 0; i < who.length; i += 2) {
    out.push('<tr>');
    for (const cell of [who[i], who[i + 1]]) {
      out.push(cell ? `<td><span class="label">${cell[0]}</span>${cell[1]}</td>` : '<td></td>');
    }
    out.push('</tr>');
  }
  out.push('</table>');

  out.push('<div class="totals">');
  out.push(`<div><span class="label">Total value</span><span class="figure serif">${money(summary.totalCents)}</span></div>`);
  out.push(`<div><span class="label">Items</span><span class="figure serif">${summary.count.toLocaleString('en-US')}</span></div>`);
  out.push(`<div><span class="label">Rooms</span><span class="figure serif">${rooms.filter((r) => r.count > 0).length}</span></div>`);
  out.push('</div>');

  if (summary.count === 0) {
    out.push('<p class="muted">Nothing has been added to this inventory yet.</p>');
  } else {
    const totalsEm = moneyColumnEm([money(summary.totalCents), ...rooms.map((r) => money(r.totalCents))]);
    out.push('<h2 class="serif">Summary by room</h2>');
    out.push(`<table class="list summary"><colgroup><col><col class="c-count"><col style="width:${totalsEm}em"></colgroup>`);
    out.push('<thead><tr><th>Room</th><th class="qty">Items</th><th class="num">Value</th></tr></thead><tbody>');
    for (const r of rooms) {
      if (r.count === 0) continue;
      out.push(`<tr><td>${escapeHtml(r.room.name)}</td><td class="qty">${r.count}</td><td class="num">${money(r.totalCents)}</td></tr>`);
    }
    out.push(`</tbody><tfoot><tr><td>Total</td><td class="qty">${summary.count}</td><td class="num">${money(summary.totalCents)}</td></tr></tfoot></table>`);
  }

  const amounts: string[] = [];
  for (const item of doc.items) {
    const each = unitCents(item);
    if (each !== null) amounts.push(formatMoney(each, currency), formatMoney(itemTotalCents(item), currency));
  }
  const moneyEm = moneyColumnEm(amounts);
  const columns =
    '<colgroup>' +
    (opts.includePhotos ? '<col class="c-photo">' : '') +
    `<col><col class="c-purchase"><col class="c-qty"><col style="width:${moneyEm}em"><col style="width:${moneyEm}em">` +
    '</colgroup>';

  const receiptBlocks: string[] = [];
  for (const r of rooms) {
    if (r.count === 0) continue;
    const items = doc.items.filter((it) => it.roomId === r.room.id);
    out.push(`<h2 class="serif">${escapeHtml(r.room.name)}</h2>`);
    out.push(`<p class="sub">${plural(r.count, 'item')} · ${money(r.totalCents)}</p>`);
    out.push(`<table class="list items">${columns}<thead><tr>`);
    if (opts.includePhotos) out.push('<th class="photo">Photo</th>');
    out.push('<th>Item</th><th>Purchase</th><th class="qty">Qty</th><th class="num">Each</th><th class="num">Total</th></tr></thead><tbody>');
    for (const item of items) {
      out.push('<tr>');
      if (opts.includePhotos) {
        const src = item.photos.length ? safeImage(photoData[item.photos[0].id]) : null;
        out.push(`<td class="photo">${src ? `<img src="${src}" alt="">` : '<div class="none">No photo</div>'}</td>`);
      }
      const each = unitCents(item);
      out.push(`<td>${itemCell(item)}</td>`);
      out.push(`<td class="detail">${purchaseCell(item, currency)}</td>`);
      out.push(`<td class="qty">${item.quantity}</td>`);
      out.push(`<td class="num">${each === null ? '<span class="muted">No value</span>' : money(each)}</td>`);
      out.push(`<td class="num">${each === null ? '' : money(itemTotalCents(item))}</td>`);
      out.push('</tr>');

      if (opts.includeReceipts) {
        item.receipts.forEach((receipt, index) => {
          const src = safeImage(photoData[receipt.id]);
          if (!src) return;
          const label = item.receipts.length > 1 ? ` (${index + 1} of ${item.receipts.length})` : '';
          receiptBlocks.push(
            `<div class="receipt"><div class="name">${escapeHtml(item.name)}${label}</div>` +
              `<div class="detail">${escapeHtml(r.room.name)}</div><img src="${src}" alt=""></div>`,
          );
        });
      }
    }
    out.push('</tbody></table>');
  }

  if (receiptBlocks.length > 0) {
    out.push('<div class="receipts"><h2 class="serif">Receipts</h2>');
    out.push(receiptBlocks.join(''));
    out.push('</div>');
  }

  out.push(
    '<p class="closing">Values are the owner’s own figures: the replacement value where one was given, otherwise the price paid. ' +
      `Prepared with Roomfile on ${escapeHtml(displayTime(opts.generatedAt))}.</p>`,
  );
  out.push('</body></html>');
  return out.join('');
}

/** Which photo files the report needs, so only those are read from disk. */
export function reportPhotoIds(doc: Doc, opts: Pick<ReportOptions, 'includePhotos' | 'includeReceipts'>): {
  thumbs: string[];
  full: string[];
} {
  const thumbs: string[] = [];
  const full: string[] = [];
  for (const item of doc.items) {
    if (opts.includePhotos && item.photos.length) thumbs.push(item.photos[0].id);
    if (opts.includeReceipts) for (const r of item.receipts) full.push(r.id);
  }
  return { thumbs, full };
}

export function reportFileName(doc: Doc, generatedAt: number): string {
  const d = new Date(generatedAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = (doc.profile.homeName || 'Home inventory').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-');
  return `${base || 'Home-inventory'}-${stamp}`;
}
