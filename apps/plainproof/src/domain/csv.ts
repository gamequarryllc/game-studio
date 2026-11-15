import { toYmd } from './dates';
import { itemTotalCents, unitCents } from './selectors';
import { CATEGORY_LABELS, CONDITION_LABELS, type Doc, type Item } from './types';

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

/**
 * A code that must stay exactly as written (a serial or model number). Excel
 * and Numbers turn "0012345678" into 12345678, a 15-digit IMEI into
 * 3.56938E+14 and "3-4" into a date. Anything that looks like a number or a
 * date is written as ="…", which every spreadsheet shows as that text.
 */
export function codeCell(value: string): string {
  if (value === '') return '';
  if (/^[\d\s.,+\-/:eE]+$/.test(value) && /\d/.test(value)) return `"=""${value}"""`;
  return csvCell(value);
}

function basis(item: Item): string {
  if (item.valueCents !== null) return 'Replacement value';
  if (item.pricePaidCents !== null) return 'Price paid';
  return 'No value';
}

function firstTaken(item: Item): string {
  const taken = item.photos.map((p) => p.takenAt).filter((t): t is number => t !== null);
  return taken.length ? toYmd(new Date(Math.min(...taken))) : '';
}

export const CSV_HEADER = [
  'Room',
  'Item',
  'Category',
  'Condition',
  'Quantity',
  'Brand',
  'Model',
  'Serial number',
  'Replacement value each',
  'Price paid each',
  'Value each',
  'Total value',
  'Value basis',
  'Purchase date',
  'Purchased from',
  'Notes',
  'Photos',
  'Receipts',
  'Recorded',
  'First photo taken',
  'Item ID',
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
          item.condition ? CONDITION_LABELS[item.condition] : '',
          String(item.quantity),
          csvCell(item.brand),
          codeCell(item.model),
          codeCell(item.serial),
          decimal(item.valueCents),
          decimal(item.pricePaidCents),
          decimal(unitCents(item)),
          unitCents(item) === null ? '' : decimal(itemTotalCents(item)),
          basis(item),
          item.purchaseDate ?? '',
          csvCell(item.purchasedFrom),
          csvCell(item.notes),
          String(item.photos.length),
          String(item.receipts.length),
          toYmd(new Date(item.createdAt)),
          firstTaken(item),
          item.id,
        ].join(','),
      );
    }
  }
  // A byte-order mark so Excel reads accents correctly; CRLF as the format asks.
  return '﻿' + rows.join('\r\n') + '\r\n';
}
