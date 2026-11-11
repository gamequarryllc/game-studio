import { LIMITS } from './types';

export const CURRENCIES: readonly { code: string; name: string }[] = [
  { code: 'USD', name: 'US dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'GBP', name: 'British pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'SGD', name: 'Singapore dollar' },
];

export type MoneyParse = { ok: true; cents: number | null } | { ok: false; reason: 'not-a-number' | 'too-large' };

/**
 * Reads what someone typed into a money field. Empty means "no amount".
 * Accepts "1299", "1,299.50", "1.299,50", "$ 1 299.5" and "12,5".
 */
export function parseMoney(input: string): MoneyParse {
  const s = input.replace(/[\s  '’]/g, '').replace(/^[^\d.,-]+|[^\d.,]+$/g, '');
  if (s === '') return input.trim() === '' ? { ok: true, cents: null } : { ok: false, reason: 'not-a-number' };
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return { ok: false, reason: 'not-a-number' };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
    // The decimal mark can only appear once: "1.2.3,4,5" is not an amount.
    if (s.split(s[decimalAt]).length - 1 > 1) return { ok: false, reason: 'not-a-number' };
  } else if (lastComma >= 0) {
    const commas = s.split(',').length - 1;
    const tail = s.length - lastComma - 1;
    // "1,299" and "1,299,000" are thousands; "12,5" and "0,99" are decimals.
    decimalAt = commas === 1 && tail !== 3 ? lastComma : -1;
  } else if (lastDot >= 0) {
    const dots = s.split('.').length - 1;
    decimalAt = dots === 1 ? lastDot : -1;
  }

  let whole = decimalAt >= 0 ? s.slice(0, decimalAt) : s;
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1) : '';
  whole = whole.replace(/[.,]/g, '');
  if (/[.,]/.test(frac)) return { ok: false, reason: 'not-a-number' };
  if (whole === '' && frac === '') return { ok: false, reason: 'not-a-number' };
  if (whole.length > 12) return { ok: false, reason: 'too-large' };

  const units = Number(whole || '0');
  // Round half up on the third decimal place.
  const fracPadded = (frac + '000').slice(0, 3);
  let cents = units * 100 + Number(fracPadded.slice(0, 2)) + (Number(fracPadded[2]) >= 5 ? 1 : 0);
  if (!Number.isFinite(cents)) return { ok: false, reason: 'not-a-number' };
  if (cents > LIMITS.cents) return { ok: false, reason: 'too-large' };
  cents = Math.round(cents);
  return { ok: true, cents };
}

/** The text to put back into a money field: "1299.5" becomes "1299.50", whole amounts stay whole. */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

const formatters = new Map<string, Intl.NumberFormat | null>();

function formatter(currency: string, whole: boolean): Intl.NumberFormat | null {
  const key = `${currency}:${whole ? 0 : 2}`;
  if (!formatters.has(key)) {
    try {
      formatters.set(
        key,
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: whole ? 0 : 2,
          maximumFractionDigits: whole ? 0 : 2,
        }),
      );
    } catch {
      formatters.set(key, null);
    }
  }
  return formatters.get(key) ?? null;
}

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * "$1,299.50". With `whole`, cents are dropped when they are zero and kept
 * otherwise, so a total never claims more precision than it has.
 */
export function formatMoney(cents: number, currency: string, opts: { whole?: boolean } = {}): string {
  const dropCents = opts.whole === true && cents % 100 === 0;
  const f = formatter(currency, dropCents);
  if (f) return f.format(cents / 100);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return dropCents ? `${currency} ${group(whole)}` : `${currency} ${group(whole)}.${frac}`;
}

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', MX: 'MXN',
  IN: 'INR', ZA: 'ZAR', SG: 'SGD',
  IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** A starting currency from a locale such as "en-GB". The person can change it in Settings. */
export function currencyForLocale(locale: string | undefined): string {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? '')?.[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || 'USD';
}
