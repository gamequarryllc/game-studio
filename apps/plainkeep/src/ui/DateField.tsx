import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable, Text, View } from 'react-native';

import { fromYmd, toYmd } from '@/domain/dates';

import { Icon } from './Icon';
import { space, type, useTheme } from './theme';

// A date row for a form: the system's compact date picker on iPhone.
// The web preview uses the browser's own date field: DateField.web.tsx.

export function DateField({
  value,
  onChange,
  testID,
  label = 'Date',
  emptyLabel = 'Add date',
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
  /** The latest day that can be chosen (today, for something already done). */
  max?: string;
  min?: string;
}) {
  const { c, dark } = useTheme();
  if (value === null) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${emptyLabel}`} onPress={() => onChange(max ?? toYmd(new Date()))} hitSlop={8}>
        <Text style={[type.body, { color: c.blue }]}>{emptyLabel}</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      <DateTimePicker
        testID={testID}
        value={fromYmd(value)}
        mode="date"
        display="compact"
        maximumDate={max ? fromYmd(max) : undefined}
        minimumDate={min ? fromYmd(min) : undefined}
        accentColor={c.blue}
        themeVariant={dark ? 'dark' : 'light'}
        onValueChange={(_event, date) => onChange(toYmd(date))}
      />
      {clearable ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} onPress={() => onChange(null)} hitSlop={10}>
          <Icon name="clear" size={18} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A time of day, as the system's compact time picker. */
export function TimeField({ hour, minute, onChange, testID }: { hour: number; minute: number; onChange: (hour: number, minute: number) => void; testID?: string }) {
  const { c, dark } = useTheme();
  const value = new Date(2026, 0, 1, hour, minute, 0, 0);
  return (
    <DateTimePicker
      testID={testID}
      value={value}
      mode="time"
      display="compact"
      minuteInterval={5}
      accentColor={c.blue}
      themeVariant={dark ? 'dark' : 'light'}
      onValueChange={(_event, date) => onChange(date.getHours(), date.getMinutes())}
    />
  );
}
