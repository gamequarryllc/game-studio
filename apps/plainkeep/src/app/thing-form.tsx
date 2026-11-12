import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addThing, deleteThing, updateThing } from '@/domain/actions';
import { newId } from '@/domain/ids';
import { canAddThing } from '@/domain/limits';
import { LIMITS, type ThingIcon, type ThingKind } from '@/domain/types';
import { success, tap, warning } from '@/platform/haptics';
import { pro } from '@/pro/pro';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { Segmented, TextRow } from '@/ui/form';
import { Icon, thingIconName } from '@/ui/Icon';
import { confirm } from '@/ui/dialogs';
import { BarButton, Card, Divider, Footnote, Row, SectionLabel } from '@/ui/kit';
import { NO_OUTLINE, radius, space, type, useTheme } from '@/ui/theme';

const ICONS: Record<ThingKind, ThingIcon[]> = {
  home: ['house', 'apartment', 'cabin'],
  vehicle: ['car', 'truck', 'motorcycle', 'camper', 'boat'],
  other: ['mower', 'bicycle', 'tools', 'box', 'boat'],
};

const NAME_HINT: Record<ThingKind, string> = { home: 'Home', vehicle: 'What do you call it?', other: 'Mower, bike, generator' };
const DETAIL_HINT: Record<ThingKind, string> = { home: 'Address or a note', vehicle: 'Year, make and model', other: 'Make and model' };

export default function ThingForm() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; kind?: string; first?: string }>();
  const doc = useDoc();
  const editing = params.id ? doc.things.find((t) => t.id === params.id) : undefined;
  const startKind: ThingKind = editing?.kind ?? (params.kind === 'vehicle' || params.kind === 'other' ? params.kind : 'home');

  const [kind, setKind] = useState<ThingKind>(startKind);
  const [icon, setIcon] = useState<ThingIcon>(editing?.icon ?? ICONS[startKind][0]);
  const [name, setName] = useState(editing?.name ?? (startKind === 'home' && !doc.things.some((t) => t.kind === 'home') ? 'Home' : ''));
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [odometer, setOdometer] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const unit = doc.settings.distanceUnit;
  const reading = odometer.trim() === '' ? null : Number(odometer.replace(/[^\d]/g, ''));
  const readingBad = reading !== null && (!Number.isFinite(reading) || reading > LIMITS.distance);
  const nameMissing = name.trim() === '';

  const changeKind = (next: ThingKind) => {
    setKind(next);
    setIcon(ICONS[next][0]);
    if (next === 'home' && name.trim() === '') setName('Home');
    if (next !== 'home' && name === 'Home') setName('');
  };

  const save = () => {
    if (nameMissing || readingBad) {
      setShowErrors(true);
      warning();
      return;
    }
    if (editing) {
      store.update((d, now) => updateThing(d, editing.id, { name, detail, icon }, now));
      success();
      goBack(router, '/things');
      return;
    }
    if (!canAddThing(store.get().things.length, pro.snapshot().isPro)) {
      router.replace('/pro');
      return;
    }
    const id = newId();
    store.update((d, now) => addThing(d, { kind, icon, name, detail, odometer: kind === 'vehicle' ? reading : null }, now, id));
    success();
    // Straight on to the usual jobs for it, so a new thing is never left with nothing to do.
    router.replace({ pathname: '/suggestions', params: { thingId: id, fresh: '1' } });
  };

  const remove = async () => {
    if (!editing) return;
    const jobs = doc.jobs.filter((j) => j.thingId === editing.id).length;
    const entries = doc.entries.filter((e) => e.thingId === editing.id).length;
    const sure = await confirm({
      title: `Delete ${editing.name}?`,
      message: jobs + entries === 0 ? undefined : `Its ${jobs} ${jobs === 1 ? 'job' : 'jobs'} and ${entries} log ${entries === 1 ? 'entry' : 'entries'} go with it. A backup, if you made one, is not touched.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    warning();
    // Out of the form and off the thing's own screen before it goes.
    router.dismissTo('/things');
    store.update((d, now) => deleteThing(d, editing.id, now));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit' : 'New thing',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={() => goBack(router, '/things')} />,
          headerRight: () => <BarButton testID="form-save" label={editing ? 'Save' : 'Next'} bold onPress={save} />,
        }}
      />
      <ScrollView testID="thing-form" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
        {editing ? null : (
          <View style={{ marginHorizontal: space.xl - space.l }}>
            <Segmented
              testID="kind"
              value={kind}
              onChange={changeKind}
              options={[
                { key: 'home', label: 'Home' },
                { key: 'vehicle', label: 'Vehicle' },
                { key: 'other', label: 'Other' },
              ]}
            />
          </View>
        )}

        <Card style={{ marginTop: space.m }}>
          <View style={{ paddingHorizontal: space.l, paddingVertical: 10 }}>
            <TextInput
              testID="field-name"
              accessibilityLabel="Name"
              value={name}
              onChangeText={setName}
              placeholder={NAME_HINT[kind]}
              placeholderTextColor={c.ink3}
              selectionColor={c.blue}
              maxLength={LIMITS.name}
              autoCapitalize="words"
              returnKeyType="done"
              style={[type.title, NO_OUTLINE, { color: c.ink, paddingVertical: 4 }]}
            />
            {showErrors && nameMissing ? (
              <Text accessibilityRole="alert" testID="error-name" style={[type.footnote, { color: c.red }]}>
                Give it a name: “Home”, or what you call the car.
              </Text>
            ) : null}
          </View>
          <Divider />
          <TextRow testID="field-detail" label="Details" value={detail} onChangeText={setDetail} placeholder={DETAIL_HINT[kind]} maxLength={LIMITS.detail} autoCapitalize="sentences" />
          {kind === 'vehicle' && !editing ? (
            <>
              <Divider />
              <TextRow
                testID="field-odometer"
                label="Odometer today"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="If you know it"
                keyboardType="number-pad"
                suffix={unit}
                error={showErrors && readingBad ? 'That is more than an odometer shows.' : null}
              />
            </>
          ) : null}
        </Card>
        {kind === 'vehicle' && !editing ? <Footnote>With a reading, jobs like an oil change can be timed by distance as well as by date.</Footnote> : null}

        <SectionLabel>Symbol</SectionLabel>
        <View style={{ flexDirection: 'row', gap: space.m, marginHorizontal: space.xl }}>
          {ICONS[kind].map((option) => {
            const on = option === icon;
            return (
              <Pressable
                key={option}
                testID={`icon-${option}`}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  setIcon(option);
                }}
                style={{ width: 52, height: 52, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.blueSoft : c.card, borderWidth: on ? 2 : 1, borderColor: on ? c.blue : c.rule }}>
                <Icon name={thingIconName(option)} size={26} color={on ? c.blue : c.ink2} />
              </Pressable>
            );
          })}
        </View>

        {editing ? (
          <Card style={{ marginTop: space.huge }}>
            <Row testID="thing-delete" title={`Delete ${editing.name}`} destructive onPress={remove} />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
