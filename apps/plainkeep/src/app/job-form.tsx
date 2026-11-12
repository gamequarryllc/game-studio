import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addJob, defaultFirstDue, deleteJob, updateJob } from '@/domain/actions';
import { displayYmd } from '@/domain/dates';
import { groupDigits, leadText } from '@/domain/labels';
import { currentReading, lastEntry } from '@/domain/schedule';
import { LEAD_CHOICES, LIMITS, type Interval, type IntervalUnit } from '@/domain/types';
import { success, tap, warning } from '@/platform/haptics';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { choose, confirm } from '@/ui/dialogs';
import { FormRow, PickRow, Segmented, SwitchRow, TextRow } from '@/ui/form';
import { Icon } from '@/ui/Icon';
import { BarButton, Card, Divider, Footnote, Row, SectionLabel } from '@/ui/kit';
import { NO_OUTLINE, radius, space, type, useTheme } from '@/ui/theme';

const UNITS: { key: IntervalUnit; one: string; many: string }[] = [
  { key: 'day', one: 'Day', many: 'Days' },
  { key: 'week', one: 'Week', many: 'Weeks' },
  { key: 'month', one: 'Month', many: 'Months' },
  { key: 'year', one: 'Year', many: 'Years' },
];

const digits = (s: string) => s.replace(/[^\d]/g, '');

type Mode = 'date' | 'distance' | 'both' | 'once';

export default function JobForm() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; thingId?: string }>();
  const doc = useDoc();
  const editing = params.id ? doc.jobs.find((j) => j.id === params.id) : undefined;
  const today = useToday();
  const unit = doc.settings.distanceUnit;

  const [thingId, setThingId] = useState<string>(editing?.thingId ?? (doc.things.some((t) => t.id === params.thingId) ? (params.thingId as string) : (doc.things[0]?.id ?? '')));
  const thing = doc.things.find((t) => t.id === thingId);
  const vehicle = thing?.kind === 'vehicle';

  const [name, setName] = useState(editing?.name ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [mode, setMode] = useState<Mode>(editing ? (editing.every && editing.everyDistance !== null ? 'both' : editing.every ? 'date' : editing.everyDistance !== null ? 'distance' : 'once') : 'date');
  const [everyN, setEveryN] = useState(String(editing?.every?.n ?? 3));
  const [everyUnit, setEveryUnit] = useState<IntervalUnit>(editing?.every?.unit ?? 'month');
  const [distance, setDistance] = useState(editing?.everyDistance != null ? String(editing.everyDistance) : '');
  const [fixed, setFixed] = useState(editing?.anchor === 'fixed');
  const [lastDone, setLastDone] = useState<string | null>(null);
  const [lastDistance, setLastDistance] = useState('');
  const [firstDue, setFirstDue] = useState<string | null>(editing?.startYmd ?? null);
  const [lead, setLead] = useState<number | null>(editing?.leadDays ?? null);
  const [showErrors, setShowErrors] = useState(false);

  // A thing with no odometer can only go by the date, or happen once.
  const byDate = mode === 'date' || mode === 'both' || (mode === 'distance' && !vehicle);
  const byDistance = vehicle && (mode === 'distance' || mode === 'both');
  const n = Number(digits(everyN));
  const every: Interval | null = byDate && n >= 1 && n <= LIMITS.intervalN ? { n, unit: everyUnit } : null;
  const everyDistance = byDistance && digits(distance) !== '' ? Number(digits(distance)) : null;
  const nameMissing = name.trim() === '';
  const intervalBad = byDate && every === null;
  const distanceBad = byDistance && (everyDistance === null || everyDistance < 1 || everyDistance > LIMITS.distance);
  const logged = editing ? lastEntry(editing.id, doc.entries) : null;
  const once = !byDate && !byDistance;
  const reading = thing && vehicle ? currentReading(thing) : null;

  const pickThing = async () => {
    const picked = await choose({ title: 'Which is it for?', choices: doc.things.map((t) => ({ key: t.id, label: t.name })) });
    if (picked) setThingId(picked);
  };

  const pickUnit = async () => {
    const picked = await choose({ choices: UNITS.map((u) => ({ key: u.key, label: n === 1 ? u.one : u.many })) });
    if (picked) setEveryUnit(picked);
  };

  const unitWord = (n === 1 ? UNITS.find((u) => u.key === everyUnit)?.one : UNITS.find((u) => u.key === everyUnit)?.many) ?? 'Months';

  const pickLead = async () => {
    const picked = await choose({
      title: 'When to remind you',
      choices: [{ key: 'default', label: `The usual: ${leadText(doc.settings.leadDays).toLowerCase()}` }, ...LEAD_CHOICES.map((d) => ({ key: String(d), label: leadText(d) }))],
    });
    if (picked) setLead(picked === 'default' ? null : Number(picked));
  };

  const save = () => {
    if (nameMissing || intervalBad || distanceBad || !thing) {
      setShowErrors(true);
      warning();
      return;
    }
    if (editing) {
      store.update((d, now) =>
        updateJob(d, editing.id, { name, note, every, everyDistance, anchor: fixed && every ? 'fixed' : 'done', startYmd: fixed || !logged ? (firstDue ?? editing.startYmd ?? (every || once ? defaultFirstDue(every, today) : null)) : editing.startYmd, leadDays: lead, unsure: firstDue !== null && firstDue !== editing.startYmd ? false : editing.unsure }, now),
      );
    } else {
      store.update((d, now) =>
        addJob(
          d,
          {
            thingId: thing.id,
            name,
            note,
            every,
            everyDistance,
            anchor: fixed && every ? 'fixed' : 'done',
            lastDoneYmd: lastDone,
            lastDoneDistance: lastDone && digits(lastDistance) !== '' ? Number(digits(lastDistance)) : null,
            firstDueYmd: firstDue,
            leadDays: lead,
          },
          now,
        ),
      );
    }
    success();
    goBack(router);
  };

  const remove = async () => {
    if (!editing) return;
    const sure = await confirm({ title: `Delete ${editing.name}?`, message: logged ? 'What has been logged for it stays in the log.' : undefined, confirmLabel: 'Delete', destructive: true });
    if (!sure) return;
    warning();
    // Out of the form and off the job's own screen before it goes.
    router.dismissTo({ pathname: '/thing/[id]', params: { id: editing.thingId } });
    store.update((d, now) => deleteJob(d, editing.id, now));
  };

  if (doc.things.length === 0 || (params.id && !editing)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, padding: space.xxl }}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BarButton label="Close" onPress={() => goBack(router)} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>{params.id ? 'This job is no longer here.' : 'Add something to look after first, then its jobs.'}</Text>
      </View>
    );
  }

  const dueLabel = once ? 'Due' : 'Next due';
  const showFirstDue = fixed || (editing ? !logged && (byDate || once) : !lastDone && (byDate || once));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit job' : 'New job',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={() => goBack(router)} />,
          headerRight: () => <BarButton testID="form-save" label="Save" bold onPress={save} />,
        }}
      />
      <ScrollView testID="job-form" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
        <Card>
          <View style={{ paddingHorizontal: space.l, paddingVertical: 10 }}>
            <TextInput
              testID="field-name"
              accessibilityLabel="Job"
              value={name}
              onChangeText={setName}
              placeholder="What needs doing?"
              placeholderTextColor={c.ink3}
              selectionColor={c.blue}
              maxLength={LIMITS.name}
              autoFocus={!editing && Platform.OS !== 'web'}
              autoCapitalize="sentences"
              returnKeyType="done"
              style={[type.title, NO_OUTLINE, { color: c.ink, paddingVertical: 4 }]}
            />
            {showErrors && nameMissing ? (
              <Text accessibilityRole="alert" testID="error-name" style={[type.footnote, { color: c.red }]}>
                Say what the job is: “Furnace filter”, “Oil change”.
              </Text>
            ) : null}
          </View>
          {editing || doc.things.length < 2 ? null : (
            <>
              <Divider />
              <PickRow testID="field-thing" label="For" value={thing?.name ?? null} placeholder="Choose" onPress={pickThing} />
            </>
          )}
        </Card>

        <SectionLabel>How often</SectionLabel>
        <Card>
          <Segmented
            testID="mode"
            value={mode === 'distance' && !vehicle ? 'date' : mode === 'both' && !vehicle ? 'date' : mode}
            onChange={setMode}
            options={
              vehicle
                ? [
                    { key: 'date', label: 'Date' },
                    { key: 'distance', label: unit === 'mi' ? 'Mileage' : 'Distance' },
                    { key: 'both', label: 'Both' },
                    { key: 'once', label: 'Once' },
                  ]
                : [
                    { key: 'date', label: 'Repeats' },
                    { key: 'once', label: 'Once' },
                  ]
            }
          />
          {byDate ? (
            <>
              <Divider />
              <FormRow label="Every" error={showErrors && intervalBad ? 'Enter a number from 1 to 999.' : null}>
                <TextInput
                  testID="field-every-n"
                  accessibilityLabel="Every how many"
                  value={everyN}
                  onChangeText={(t) => setEveryN(digits(t).slice(0, 3))}
                  keyboardType="number-pad"
                  selectionColor={c.blue}
                  selectTextOnFocus
                  style={[type.body, type.tabular, NO_OUTLINE, { color: c.ink, textAlign: 'center', width: 52, paddingVertical: 5, borderRadius: radius.s + 2, backgroundColor: c.sunk }]}
                />
                <Pressable
                  testID="field-every-unit"
                  accessibilityRole="button"
                  accessibilityLabel={`Unit: ${unitWord}`}
                  onPress={() => {
                    tap();
                    void pickUnit();
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: space.m, borderRadius: radius.s + 2, backgroundColor: c.sunk }}>
                  <Text style={[type.body, { color: c.ink }]}>{unitWord}</Text>
                  <Icon name="chevronDown" size={12} color={c.ink2} />
                </Pressable>
              </FormRow>
              <Divider />
              <SwitchRow
                testID="field-fixed"
                label="Stays on its date"
                value={fixed}
                onChange={setFixed}
                hint={fixed ? 'Like a registration: due on the same date however early or late you do it.' : 'Off: the next one counts from the day you do it, like a filter.'}
              />
            </>
          ) : null}
          {byDistance ? (
            <>
              <Divider />
              <TextRow
                testID="field-distance"
                label={byDate ? 'Or every' : 'Every'}
                value={distance}
                onChangeText={(t) => setDistance(digits(t).slice(0, 7))}
                placeholder="5000"
                keyboardType="number-pad"
                suffix={unit}
                error={showErrors && distanceBad ? 'Enter a distance.' : null}
              />
            </>
          ) : null}
        </Card>
        {mode === 'both' && vehicle ? <Footnote>Whichever comes first decides.</Footnote> : null}
        {once ? <Footnote>It happens once: give it a date below, and it is finished when you mark it done.</Footnote> : null}

        <SectionLabel>{once ? 'When' : 'Last done and next due'}</SectionLabel>
        <Card>
          {editing ? (
            logged ? (
              <FormRow label="Last logged">
                <Text style={[type.body, { color: c.ink2 }]}>{displayYmd(logged.ymd)}</Text>
              </FormRow>
            ) : null
          ) : (
            <>
              <FormRow label="Last done">
                <DateField testID="field-last-done" label="Last done" value={lastDone} onChange={setLastDone} emptyLabel="Not sure" max={today} />
              </FormRow>
              {lastDone && vehicle ? (
                <>
                  <Divider />
                  <TextRow testID="field-last-distance" label="Odometer then" value={lastDistance} onChangeText={(t) => setLastDistance(digits(t).slice(0, 7))} placeholder={reading ? groupDigits(reading.value) : 'If you know it'} keyboardType="number-pad" suffix={unit} />
                </>
              ) : null}
            </>
          )}
          {showFirstDue ? (
            <>
              {editing && !logged ? null : <Divider />}
              <FormRow label={dueLabel}>
                <DateField testID="field-first-due" label={dueLabel} value={firstDue} onChange={setFirstDue} emptyLabel={once ? 'No date' : fixed ? 'Choose the date' : 'Not sure'} />
              </FormRow>
            </>
          ) : null}
        </Card>
        {!editing && !lastDone && !firstDue && !once ? <Footnote>Leave both as “Not sure” and the job waits under “Not logged yet” until you first mark it done. You’ll get one reminder to look at it, within a month.</Footnote> : null}

        <SectionLabel>Reminder</SectionLabel>
        <Card>
          <PickRow testID="field-lead" label="Remind me" value={leadText(lead ?? doc.settings.leadDays)} placeholder="" onPress={pickLead} />
        </Card>

        <SectionLabel>For next time</SectionLabel>
        <Card>
          <TextInput
            testID="field-note"
            accessibilityLabel="Note"
            value={note}
            onChangeText={setNote}
            placeholder="A filter size, a part number, who to call"
            placeholderTextColor={c.ink3}
            selectionColor={c.blue}
            maxLength={LIMITS.note}
            multiline
            style={[type.body, NO_OUTLINE, { color: c.ink, minHeight: 76, paddingHorizontal: space.l, paddingVertical: space.m, textAlignVertical: 'top' }]}
          />
        </Card>

        {editing ? (
          <Card style={{ marginTop: space.huge }}>
            <Row testID="job-delete" title="Delete this job" destructive onPress={remove} />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
