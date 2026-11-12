import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addReading, deleteReading } from '@/domain/actions';
import { displayYmd } from '@/domain/dates';
import { distanceText, groupDigits } from '@/domain/labels';
import { currentReading, sortedReadings } from '@/domain/schedule';
import { LIMITS } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { confirm } from '@/ui/dialogs';
import { FormRow, TextRow } from '@/ui/form';
import { BarButton, Card, Divider, Footnote, Row, SectionLabel } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

const digits = (s: string) => s.replace(/[^\d]/g, '');

export default function OdometerForm() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ thingId?: string }>();
  const doc = useDoc();
  const thing = doc.things.find((t) => t.id === params.thingId && t.kind === 'vehicle');
  const today = useToday();
  const unit = doc.settings.distanceUnit;
  const [value, setValue] = useState('');
  const [ymd, setYmd] = useState<string>(today);
  const [showErrors, setShowErrors] = useState(false);

  if (!thing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, padding: space.xxl }}>
        <Stack.Screen options={{ headerLeft: () => <BarButton label="Close" onPress={() => goBack(router, '/things')} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>That is no longer here.</Text>
      </View>
    );
  }

  const latest = currentReading(thing);
  const past = sortedReadings(thing.readings).reverse();
  const n = digits(value) === '' ? null : Number(digits(value));
  const bad = n === null || n > LIMITS.distance;

  const save = async () => {
    if (bad || n === null) {
      setShowErrors(true);
      warning();
      return;
    }
    if (latest && n < latest.value && ymd >= latest.ymd) {
      const sure = await confirm({
        title: 'Lower than the last reading',
        message: `The last one was ${distanceText(latest.value, unit)}. Save ${distanceText(n, unit)} anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!sure) return;
    }
    store.update((d, now) => addReading(d, thing.id, { ymd, value: n }, now));
    success();
    goBack(router, '/things');
  };

  const remove = async (day: string) => {
    const sure = await confirm({ title: 'Delete this reading?', confirmLabel: 'Delete', destructive: true });
    if (sure) store.update((d, now) => deleteReading(d, thing.id, day, now));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          title: 'Odometer',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={() => goBack(router, '/things')} />,
          headerRight: () => <BarButton testID="form-save" label="Save" bold onPress={save} />,
        }}
      />
      <ScrollView testID="odometer-form" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
        <Text style={[type.subhead, { color: c.ink2, marginHorizontal: space.xl + 2, marginBottom: space.s }]}>{thing.name}</Text>
        <Card>
          <TextRow
            testID="field-reading"
            label="Odometer"
            value={value}
            onChangeText={(t) => setValue(digits(t).slice(0, 7))}
            placeholder={latest ? groupDigits(latest.value) : 'What it says now'}
            keyboardType="number-pad"
            autoFocus={Platform.OS !== 'web'}
            suffix={unit}
            error={showErrors && bad ? 'Enter what the odometer says.' : null}
          />
          <Divider />
          <FormRow label="Read on">
            <DateField testID="field-date" label="Read on" value={ymd} onChange={(v) => setYmd(v ?? today)} clearable={false} max={today} />
          </FormRow>
        </Card>
        <Footnote>A reading every month or so is plenty. From two of them the app works out how far you drive, and when mileage jobs will be due.</Footnote>

        {past.length > 0 ? (
          <>
            <SectionLabel>Readings</SectionLabel>
            <Card>
              {past.slice(0, 24).map((r, i) => (
                <Fragment key={r.ymd}>
                  {i > 0 ? <Divider /> : null}
                  <Row testID={`reading-${r.ymd}`} title={distanceText(r.value, unit)} subtitle={displayYmd(r.ymd)} value="Delete" valueTone="red" onPress={() => remove(r.ymd)} />
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
