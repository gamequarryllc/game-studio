import { centsToInput, figureSize, formatMoney, parseMoney, tidyMoneyInput } from '../money';

const cents = (s: string) => {
  const r = parseMoney(s);
  return r.ok ? r.cents : r.reason;
};

describe('parseMoney', () => {
  it('reads plain and grouped amounts', () => {
    expect(cents('1299')).toBe(129900);
    expect(cents('1,299')).toBe(129900);
    expect(cents('1,299.5')).toBe(129950);
    expect(cents('1,299,000')).toBe(129900000);
    expect(cents('0.99')).toBe(99);
    expect(cents('.5')).toBe(50);
    expect(cents('12.')).toBe(1200);
  });

  it('reads European decimals and separators', () => {
    expect(cents('12,5')).toBe(1250);
    expect(cents('0,99')).toBe(99);
    expect(cents('1.299,50')).toBe(129950);
    expect(cents('1.299.000')).toBe(129900000);
    expect(cents('1 299,50')).toBe(129950);
    // One dot and three digits is a thousands mark, as a comma is: never $1.30.
    expect(cents('1.299')).toBe(129900);
    expect(cents('12.5')).toBe(1250);
  });

  it('ignores a currency sign and spaces', () => {
    expect(cents('$1,299.50')).toBe(129950);
    expect(cents(' £ 20 ')).toBe(2000);
    expect(cents('20 €')).toBe(2000);
  });

  it('rounds a third decimal half up', () => {
    expect(cents('1,000.005')).toBe(100001);
    expect(cents('1,000.004')).toBe(100000);
    expect(cents('19.9999')).toBe(2000);
    expect(cents('0.999')).toBe(100);
  });

  it('treats empty as no amount', () => {
    expect(cents('')).toBeNull();
    expect(cents('   ')).toBeNull();
  });

  it('refuses what is not an amount', () => {
    expect(cents('abc')).toBe('not-a-number');
    expect(cents('12abc34')).toBe('not-a-number');
    expect(cents('-5')).toBe('not-a-number');
    expect(cents('1.2.3,4,5')).toBe('not-a-number');
    expect(cents('$')).toBe('not-a-number');
    expect(cents('.')).toBe('not-a-number');
  });

  it('refuses amounts past the limit instead of storing nonsense', () => {
    expect(cents('999999999.99')).toBe(99999999999);
    expect(cents('1000000000')).toBe('too-large');
    expect(cents('99999999999999999999')).toBe('too-large');
  });
});

describe('centsToInput', () => {
  it('round-trips through parseMoney', () => {
    for (const c of [0, 5, 99, 100, 129950, 99999999999]) {
      expect(cents(centsToInput(c))).toBe(c);
    }
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(120000)).toBe('1200');
    expect(centsToInput(120005)).toBe('1200.05');
  });
});

describe('formatMoney', () => {
  it('formats with the currency sign and grouping', () => {
    expect(formatMoney(129950, 'USD')).toBe('$1,299.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(99999999999, 'USD')).toBe('$999,999,999.99');
  });

  it('drops zero cents only when asked, and never real cents', () => {
    expect(formatMoney(129900, 'USD', { whole: true })).toBe('$1,299');
    expect(formatMoney(129950, 'USD', { whole: true })).toBe('$1,299.50');
  });

  it('copes with other currencies', () => {
    expect(formatMoney(5000, 'GBP')).toBe('£50.00');
    expect(formatMoney(5000, 'EUR')).toBe('€50.00');
  });
});

describe('the size of a headline amount', () => {
  it('stays full size for everyday totals', () => {
    expect(figureSize('$0', 44)).toBe(44);
    expect(figureSize('$7,097', 44)).toBe(44);
    expect(figureSize('$599,203.76', 44)).toBe(44);
  });

  it('steps down so a very large total shows whole (it used to end in an ellipsis)', () => {
    const huge = formatMoney(199999999998, 'USD');
    expect(huge).toBe('$1,999,999,999.98');
    const size = figureSize(huge, 44);
    expect(size).toBeLessThan(44);
    // Seventeen characters at this size take no more room than eleven at full size.
    expect(size * huge.length).toBeLessThanOrEqual(44 * 11);
  });

  it('never goes below a readable size', () => {
    expect(figureSize('9'.repeat(80), 44)).toBe(20);
  });
});

describe('tidyMoneyInput', () => {
  it('shows the amount as it was understood', () => {
    expect(tidyMoneyInput('1.299')).toBe('1,299');
    expect(tidyMoneyInput('12,5')).toBe('12.50');
    expect(tidyMoneyInput('$1299.5')).toBe('1,299.50');
    expect(tidyMoneyInput('abc')).toBe('abc');
    expect(tidyMoneyInput('')).toBe('');
  });
});
