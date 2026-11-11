import { itemTotalCents, unitCents } from './selectors';
import { CATEGORY_LABELS, type Doc } from './types';

function decimal(cents: number | null): string {
  if (cents === null) return '';
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * One CSV cell. Text that a spreadsheet would run as a formula gets a leading
 * apostrophe, so a note that starts with "=" stays a note.
 */
export function csvCell(value: string, isText = true): string {
  let v = value;
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CSV_HEADER = [
  'Room',
  'Item',
  'Category',
  'Quantity',
  'Brand',
  'Model',
  'Serial number',
  'Value each',
  'Total value',
  'Price paid',
  'Purchase date',
  'Purchased from',
  'Notes',
  'Photos',
  'Receipts',
] as const;

export function buildCsv(doc: Doc): string {
  const roomNames = new Map(doc.rooms.map((r) => [r.id, r.name]));
  const rows: string[] = [CSV_HEADER.join(',')];
  for (const room of doc.rooms) {
    for (const item of doc.items) {
      if (item.roomId !== room.id) continue;
      rows.push(
        [
          csvCell(roomNames.get(item.roomId) ?? ''),
          csvCell(item.name),
          csvCell(item.category ? CATEGORY_LABELS[item.category] : ''),
          String(item.quantity),
          csvCell(item.brand),
          csvCell(item.model),
          csvCell(item.serial),
          decimal(unitCents(item)),
          unitCents(item) === null ? '' : decimal(itemTotalCents(item)),
          decimal(item.pricePaidCents),
          item.purchaseDate ?? '',
          csvCell(item.purchasedFrom),
          csvCell(item.notes),
          String(item.photos.length),
          String(item.receipts.length),
        ].join(','),
      );
    }
  }
  // A byte-order mark so Excel reads accents correctly; CRLF as the format asks.
  return '﻿' + rows.join('\r\n') + '\r\n';
}
