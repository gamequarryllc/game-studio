import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteEntry, logEntry, markDone, updateEntry } from '@/domain/actions';
import { groupDigits } from '@/domain/labels';
import { centsToInput, parseMoney } from '@/domain/money';
import { currentReading } from '@/domain/schedule';
import { LIMITS } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { choose, confirm } from '@/ui/dialogs';
import { FormRow, PickRow, TextRow } from '@/ui/form';
import { BarButton, Card, Divider, Footnote, Row } from '@/ui/kit';
import { NO_OUTLINE, space, type, useTheme } from '@/ui/theme';

const digits = (s: string) => s.replace(/[^\d]/g, '');

// One form for three things: marking a job done, logging a one-off, and
// changing a line already in the log.

export default function DoneForm() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ jobId?: string; thingId?: string; entryId?: string }>();
  const doc = useDoc();
  const today = useToday();
  const entry = params.entryId ? doc.entries.find((e) => e.id === params.entryId) : undefined;
  const job = params.jobId ? doc.jobs.find((j) => j.id === params.jobId) : undefined;

  const [thingId, setThingId] = useState<string>(entry?.thingId ?? job?.thingId ?? (doc.things.some((t) => t.id === params.thingId) ? (params.thingId as string) : (doc.things[0]?.id ?? '')));
  const thing = doc.things.find((t) => t.id === thingId);
  const vehicle = thing?.kind === 'vehicle';
  const unit = doc.settings.distanceUnit;
  const reading = thing && vehicle ? currentReading(thing) : null;

  const [title, setTitle] = useState(entry?.title ?? job?.name ?? '');
  const [ymd, setYmd] = useState<string>(entry?.ymd ?? today);
  const [distance, setDistance] = useState(entry?.distance != null ? String(entry.distance) : '');
  const [costText, setCostText] = useState(centsToInput(entry?.cost ?? null));
  const [note, setNote] = useState(entry?.note ?? '');
  const [showErrors, setShowErrors] = useState(false);

  const cost = parseMoney(costText);
  const titleMissing = title.trim() === '';
  const distanceValue = digits(distance) === '' ? null : Number(digits(distance));
  const distanceBad = distanceValue !== null && distanceValue > LIMITS.distance;
  const mode: 'done' | 'oneoff' | 'edit' = entry ? 'edit' : job ? 'done' : 'oneoff';

  const pickThing = async () => {
    const picked = await choose({ title: 'Which is it for?', choices: doc.things.map((t) => ({ key: t.id, label: t.name })) });
    if (picked) setThingId(picked);
  };

  const save = () => {
    if (titleMissing || !cost.ok || distanceBad || !thing) {
      setShowErrors(true);
      warning();
      return;
    }
    if (mode === 'edit' && entry) {
      store.update((d, now) => updateEntry(d, entry.id, { title, ymd, distance: vehicle ? distanceValue : null, cost: entry.skipped ? null : cost.cents, note }, now));
    } else if (mode === 'done' && job) {
      store.update((d, now) => markDone(d, job.id, { ymd, distance: distanceValue, cost: cost.cents, note }, now));
    } else {
      store.update((d, now) => logEntry(d, { thingId: thing.id, jobId: null, title, ymd, distance: distanceValue, cost: cost.cents, note, skipped: false }, now));
    }
    success();
    goBack(router);
  };

  const remove = async () => {
    if (!entry) return;
    const sure = await confirm({ title: 'Delete this entry?', message: entry.jobId ? 'The job goes back to when it was done before this.' : undefined, confirmLabel: 'Delete', destructive: true });
    if (!sure) return;
    warning();
    goBack(router);
    store.update((d, now) => deleteEntry(d, entry.id, now));
  };

  if ((params.entryId && !entry) || (params.jobId && !job) || doc.things.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, padding: space.xxl }}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BarButton label="Close" onPress={() => goBack(router)} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>{doc.things.length === 0 ? 'Add something to look after first.' : 'That is no longer here.'}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          title: mode === 'edit' ? 'Entry' : mode === 'done' ? 'Done' : 'Log something',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={() => goBack(router)} />,
          headerRight: () => <BarButton testID="form-save" label="Save" bold onPress={save} />,
        }}
      />
      <ScrollView testID="done-form" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
        <Card>
          <View style={{ paddingHorizontal: space.l, paddingVertical: 10 }}>
            {mode === 'done' ? (
              <>
                <Text style={[type.footnote, { color: c.ink2 }]}>{thing?.name}</Text>
                <Text testID="done-title" style={[type.title, { color: c.ink, paddingVertical: 2 }]}>
                  {title}
                </Text>
              </>
            ) : (
              <TextInput
                testID="field-title"
                accessibilityLabel="What was done"
                value={title}
                onChangeText={setTitle}
                placeholder="What was done?"
                placeholderTextColor={c.ink3}
                selectionColor={c.blue}
                maxLength={LIMITS.name}
                autoFocus={mode === 'oneoff' && Platform.OS !== 'web'}
                autoCapitalize="sentences"
                returnKeyType="done"
                style={[type.title, NO_OUTLINE, { color: c.ink, paddingVertical: 4 }]}
              />
            )}
            {showErrors && titleMissing ? (
              <Text accessibilityRole="alert" testID="error-title" style={[type.footnote, { color: c.red }]}>
                Say what was done.
              </Text>
            ) : null}
          </View>
          {mode === 'oneoff' && doc.things.length > 1 ? (
            <>
              <Divider />
              <PickRow testID="field-thing" label="For" value={thing?.name ?? null} placeholder="Choose" onPress={pickThing} />
            </>
          ) : null}
          <Divider />
          <FormRow label="Date">
            <DateField testID="field-date" label="Date" value={ymd} onChange={(v) => setYmd(v ?? today)} clearable={false} max={today} />
          </FormRow>
          {vehicle ? (
            <>
              <Divider />
              <TextRow
                testID="field-distance"
                label="Odometer"
                value={distance}
                onChangeText={(t) => setDistance(digits(t).slice(0, 7))}
                placeholder={reading ? groupDigits(reading.value) : 'If you know it'}
                keyboardType="number-pad"
                suffix={unit}
                error={showErrors && distanceBad ? 'That is more than an odometer shows.' : null}
              />
            </>
          ) : null}
          {entry?.skipped ? null : (
            <>
              <Divider />
              <TextRow
                testID="field-cost"
                label="Cost"
                value={costText}
                onChangeText={setCostText}
                placeholder="Optional"
                keyboardType="decimal-pad"
                suffix={doc.settings.currency}
                error={showErrors && !cost.ok ? (cost.reason === 'too-large' ? 'That is more than the app can hold.' : 'Enter an amount, like 74.95') : null}
              />
            </>
          )}
        </Card>
        {vehicle && mode !== 'edit' ? <Footnote>The reading also updates the odometer, so distance jobs stay in step.</Footnote> : null}

        <Card style={{ marginTop: space.xl }}>
          <TextInput
            testID="field-note"
            accessibilityLabel="Note"
            value={note}
            onChangeText={setNote}
            placeholder="Who did it, what was used, what to watch"
            placeholderTextColor={c.ink3}
            selectionColor={c.blue}
            maxLength={LIMITS.note}
            multiline
            style={[type.body, NO_OUTLINE, { color: c.ink, minHeight: 76, paddingHorizontal: space.l, paddingVertical: space.m, textAlignVertical: 'top' }]}
          />
        </Card>

        {mode === 'edit' ? (
          <Card style={{ marginTop: space.xxl }}>
            <Row testID="entry-delete" title="Delete this entry" destructive onPress={remove} />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
