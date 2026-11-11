import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable, Text, View } from 'react-native';

import { fromYmd, toYmd } from '@/domain/dates';

import { Icon } from './Icon';
import { space, type, useTheme } from './theme';

// A date row for a form: the system's compact date picker on iPhone.
// The web preview uses the browser's own date field: DateField.web.tsx.

export function DateField({ value, onChange, testID }: { value: string | null; onChange: (ymd: string | null) => void; testID?: string }) {
  const { c, dark } = useTheme();
  if (value === null) {
    return (
      <Pressable testID={testID} accessibilityRole="button" onPress={() => onChange(toYmd(new Date()))} hitSlop={8}>
        <Text style={[type.body, { color: c.green }]}>Add date</Text>
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
        maximumDate={new Date()}
        accentColor={c.green}
        themeVariant={dark ? 'dark' : 'light'}
        onValueChange={(_event, date) => onChange(toYmd(date))}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Remove date" onPress={() => onChange(null)} hitSlop={10}>
        <Icon name="clear" size={18} color={c.ink3} />
      </Pressable>
    </View>
  );
}
