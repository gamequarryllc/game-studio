import { createElement } from 'react';

import { isValidYmd } from '@/domain/dates';

import { useTheme } from './theme';

// The web preview's date and time rows: the browser's own fields.

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function DateField({
  value,
  onChange,
  testID,
  label = 'Date',
  clearable = true,
  max,
  min,
}: {
  value: string | null;
  onChange: (ymd: string | null) => void;
  testID?: string;
  label?: string;
  emptyLabel?: string;
  clearable?: boolean;
  max?: string;
  min?: string;
}) {
  const { c, dark } = useTheme();
  return createElement('input', {
    type: 'date',
    'data-testid': testID,
    'aria-label': label,
    value: value ?? '',
    max,
    min,
    required: !clearable,
    onChange: (e: { target: { value: string } }) => {
      if (isValidYmd(e.target.value)) onChange(e.target.value);
      else if (clearable) onChange(null);
    },
    style: { fontFamily: FONT, fontSize: 17, color: value ? c.ink : c.ink3, background: 'transparent', border: 0, outline: 'none', textAlign: 'right', colorScheme: dark ? 'dark' : 'light' },
  });
}

export function TimeField({ hour, minute, onChange, testID }: { hour: number; minute: number; onChange: (hour: number, minute: number) => void; testID?: string }) {
  const { c, dark } = useTheme();
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return createElement('input', {
    type: 'time',
    'data-testid': testID,
    'aria-label': 'Time of day',
    value,
    step: 300,
    onChange: (e: { target: { value: string } }) => {
      const m = /^(\d{2}):(\d{2})/.exec(e.target.value);
      if (m) onChange(Number(m[1]), Number(m[2]));
    },
    style: { fontFamily: FONT, fontSize: 17, color: c.ink, background: 'transparent', border: 0, outline: 'none', textAlign: 'right', colorScheme: dark ? 'dark' : 'light' },
  });
}
