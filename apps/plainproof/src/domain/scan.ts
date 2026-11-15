import { isValidYmd } from './dates';
import { parseMoney } from './money';

// Reading text the phone found in a photo (Apple's on-device text recognition)
// into the form's fields. Pure, so every rule is unit tested; the recognition
// itself is in src/platform/textScan.ts.

const SERIAL_LABEL = /\b(s\/?n|serial(\s*(no|number|#))?|ser\.?\s*no|imei|meid)\b\s*[:#.]?\s*/i;
const CODE = /[A-Z0-9][A-Z0-9-]{4,30}[A-Z0-9]/g;

/**
 * Likely serial numbers in what a label says, best first. A code right after
 * "S/N", "Serial" or "IMEI" wins; otherwise any long code with digits in it,
 * longer ones first. Model-looking words ("MODEL", "TYPE") are left out.
 */
export function serialCandidates(lines: string[]): string[] {
  const labelled: string[] = [];
  const others: string[] = [];
  lines.forEach((raw, i) => {
    const line = raw.toUpperCase().replace(/[Oo](?=\d{3,})/g, '0');
    const m = SERIAL_LABEL.exec(line);
    if (m) {
      const after = line.slice(m.index + m[0].length).match(CODE) ?? (lines[i + 1] ?? '').toUpperCase().match(CODE) ?? [];
      labelled.push(...after.filter((c) => /\d/.test(c)));
      return;
    }
    if (/\b(MODEL|TYPE|MADE IN|INPUT|OUTPUT|RATING)\b/.test(line)) return;
    for (const c of line.match(CODE) ?? []) if (/\d/.test(c) && /[A-Z]/.test(c) ? c.length >= 6 : c.length >= 8) others.push(c);
  });
  others.sort((a, b) => b.length - a.length);
  return [...new Set([...labelled, ...others])].slice(0, 6);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function ymd(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  const s = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidYmd(s) ? s : null;
}

/** The first date on a receipt that isn't in the future. Reads 2021-03-04, 03/04/2021 (US order first), 4 Mar 2021 and Mar 4, 2021. */
export function receiptDate(lines: string[], today: string): string | null {
  for (const line of lines) {
    const found: (string | null)[] = [];
    for (const m of line.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) found.push(ymd(+m[1], +m[2], +m[3]));
    for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
      found.push(ymd(+m[3], +m[1], +m[2]) ?? ymd(+m[3], +m[2], +m[1]));
    }
    for (const m of line.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\.?,?\s+(\d{4})\b/g)) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo) found.push(ymd(+m[3], mo, +m[1]));
    }
    for (const m of line.matchAll(/\b([A-Za-z]{3,4})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
      const mo = MONTHS[m[1].toLowerCase()];
      if (mo) found.push(ymd(+m[3], mo, +m[2]));
    }
    const ok = found.find((d): d is string => d !== null && d <= today);
    if (ok) return ok;
  }
  return null;
}

/** The receipt's total: the amount on a TOTAL line (not SUBTOTAL), else the largest amount on the receipt. */
export function receiptTotalCents(lines: string[]): number | null {
  const amountsIn = (line: string) =>
    (line.match(/\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2}\b|\d+[.,]\d{2}\b/g) ?? [])
      .map((a) => parseMoney(a))
      .flatMap((r) => (r.ok && r.cents !== null ? [r.cents] : []));
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/\btotal\b/i.test(line) && !/\b(sub|subtotal|savings|items?)\b/i.test(line)) {
      const here = amountsIn(line);
      if (here.length) return here[here.length - 1];
      const next = amountsIn(lines[i + 1] ?? '');
      if (next.length) return next[0];
    }
  }
  const all = lines.flatMap(amountsIn);
  return all.length ? Math.max(...all) : null;
}

/** The shop: the first line near the top that is mostly letters and isn't an address, a phone number or a date. */
export function receiptStore(lines: string[]): string | null {
  for (const raw of lines.slice(0, 5)) {
    const line = raw.trim();
    if (line.length < 3 || line.length > 40) continue;
    const letters = line.replace(/[^A-Za-z]/g, '').length;
    if (letters < line.replace(/\s/g, '').length * 0.7) continue;
    if (/\b(receipt|welcome|thank|invoice|tax|store\s*#|tel|phone|www\.|\.com)\b/i.test(line)) continue;
    return line.replace(/\s+/g, ' ').replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase());
  }
  return null;
}

export interface ReceiptGuess {
  date: string | null;
  totalCents: number | null;
  store: string | null;
}

export function readReceipt(lines: string[], today: string): ReceiptGuess {
  return { date: receiptDate(lines, today), totalCents: receiptTotalCents(lines), store: receiptStore(lines) };
}
