import { createElement } from 'react';

import { isValidYmd, toYmd } from '@/domain/dates';

import { useTheme } from './theme';

// The web preview's date row: the browser's own date field.

export function DateField({
  value,
  onChange,
  testID,
  future,
  label = 'Purchase date',
}: {
  value: string | null;
  onChange: (ymd: string | null) => void;
  testID?: string;
  future?: boolean;
  label?: string;
}) {
  const { c, dark } = useTheme();
  return createElement('input', {
    type: 'date',
    'data-testid': testID,
    'aria-label': label,
    value: value ?? '',
    max: future ? undefined : toYmd(new Date()),
    onChange: (e: { target: { value: string } }) => onChange(isValidYmd(e.target.value) ? e.target.value : null),
    style: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 17,
      color: value ? c.ink : c.ink3,
      background: 'transparent',
      border: 0,
      outline: 'none',
      textAlign: 'right',
      colorScheme: dark ? 'dark' : 'light',
    },
  });
}
