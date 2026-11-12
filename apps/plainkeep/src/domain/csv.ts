import type { Doc } from './types';

// The log as a spreadsheet: one line for everything that was done.

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

export function csvHeader(doc: Doc): string[] {
  return ['Date', 'For', 'What was done', `Odometer (${doc.settings.distanceUnit})`, `Cost (${doc.settings.currency})`, 'Note'];
}

/** The whole log, oldest first. Skipped turns are left out: nothing was done. */
export function logCsv(doc: Doc): string {
  const names = new Map(doc.things.map((t) => [t.id, t.name]));
  const rows = doc.entries
    .filter((e) => !e.skipped)
    .sort((a, b) => (a.ymd === b.ymd ? a.createdAt - b.createdAt : a.ymd < b.ymd ? -1 : 1))
    .map((e) =>
      [
        csvCell(e.ymd, false),
        csvCell(names.get(e.thingId) ?? ''),
        csvCell(e.title),
        e.distance === null ? '' : String(e.distance),
        decimal(e.cost),
        csvCell(e.note.replace(/\n+/g, ' ')),
      ].join(','),
    );
  // A byte-order mark so Excel reads accents correctly; CRLF because that is what CSV says.
  return '﻿' + [csvHeader(doc).map((h) => csvCell(h)).join(','), ...rows].join('\r\n') + '\r\n';
}
