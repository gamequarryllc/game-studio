import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addItem, addRoom, draftFromItem, emptyDraft, updateItem, type ItemDraft } from '@/domain/actions';
import { canAddItem } from '@/domain/limits';
import { centsToInput, parseMoney } from '@/domain/money';
import { CATEGORIES, CATEGORY_LABELS, LIMITS, type Category, type Photo } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { importPhoto } from '@/platform/photos';
import { pickFromLibrary, takePhoto } from '@/platform/pickImages';
import { pro } from '@/pro/pro';
import { dropPhotos } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { ask, choose, confirm, notify } from '@/ui/dialogs';
import { FormRow, PhotoStrip, PickRow, Stepper, TextRow } from '@/ui/form';
import { BarButton, Button, Card, Divider, Footnote, SectionLabel } from '@/ui/kit';
import { NO_OUTLINE, space, type, useTheme } from '@/ui/theme';

function moneyError(text: string): string | null {
  const parsed = parseMoney(text);
  if (parsed.ok) return null;
  return parsed.reason === 'too-large' ? 'That is more than the app can hold.' : 'Enter an amount, like 1,299.50';
}

export default function ItemForm() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; roomId?: string }>();
  const doc = useDoc();
  const editing = params.id ? doc.items.find((it) => it.id === params.id) : undefined;

  const [initial] = useState<ItemDraft>(() => {
    if (editing) return draftFromItem(editing);
    const room = doc.rooms.find((r) => r.id === params.roomId) ?? doc.rooms[0];
    return emptyDraft(room?.id ?? '');
  });
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [valueText, setValueText] = useState(centsToInput(initial.valueCents));
  const [paidText, setPaidText] = useState(centsToInput(initial.pricePaidCents));
  const [showErrors, setShowErrors] = useState(false);
  const [importing, setImporting] = useState<'photos' | 'receipts' | null>(null);
  /** Photos imported while this form was open; deleted again if it is cancelled. */
  const imported = useRef<string[]>([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const room = doc.rooms.find((r) => r.id === draft.roomId);
  const nameMissing = draft.name.trim() === '';
  const valueProblem = moneyError(valueText);
  const paidProblem = moneyError(paidText);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    valueText !== centsToInput(initial.valueCents) ||
    paidText !== centsToInput(initial.pricePaidCents);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const cancel = async () => {
    if (dirty) {
      const ok = await confirm({
        title: editing ? 'Discard your changes?' : 'Discard this item?',
        confirmLabel: 'Discard',
        destructive: true,
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    const added = imported.current;
    imported.current = [];
    leave();
    void dropPhotos(added);
  };

  const addPhotos = async (kind: 'photos' | 'receipts') => {
    const max = kind === 'photos' ? LIMITS.photosPerItem : LIMITS.receiptsPerItem;
    const spare = max - draft[kind].length;
    if (spare <= 0) return;
    const source =
      Platform.OS === 'web'
        ? 'library'
        : await choose({
            choices: [
              { key: 'camera', label: 'Take a photo' },
              { key: 'library', label: 'Choose from library' },
            ],
          });
    if (!source) return;
    try {
      const picked = source === 'camera' ? await takePhoto() : await pickFromLibrary(spare);
      if (picked === 'denied') {
        await notify('The camera is switched off for Roomfile', 'You can allow it in the Settings app, under Roomfile.');
        return;
      }
      if (picked.length === 0) return;
      setImporting(kind);
      const added: Photo[] = [];
      for (const image of picked.slice(0, spare)) {
        const photo = await importPhoto(image);
        imported.current.push(photo.id);
        added.push(photo);
      }
      setDraft((d) => ({ ...d, [kind]: [...d[kind], ...added].slice(0, max) }));
    } catch {
      await notify('That photo could not be added', 'Try another photo, or take a new one.');
    } finally {
      setImporting(null);
    }
  };

  const removePhoto = (kind: 'photos' | 'receipts', id: string) => {
    setDraft((d) => ({ ...d, [kind]: d[kind].filter((p) => p.id !== id) }));
  };

  const pickRoom = async () => {
    const picked = await choose({
      title: 'Which room is it in?',
      choices: [...doc.rooms.map((r) => ({ key: r.id, label: r.name })), { key: '__new__', label: 'New room…' }],
    });
    if (!picked) return;
    if (picked !== '__new__') {
      set('roomId', picked);
      return;
    }
    const name = await ask({ title: 'New room', placeholder: 'Guest room, shed, storage unit', confirmLabel: 'Add' });
    if (!name?.trim()) return;
    const result = addRoom(store.get(), name, Date.now());
    if (result.roomId) {
      store.update(() => result.doc);
      set('roomId', result.roomId);
    }
  };

  const pickCategory = async () => {
    const picked = await choose<Category | 'none'>({
      title: 'What kind of thing is it?',
      choices: [...CATEGORIES.map((k) => ({ key: k, label: CATEGORY_LABELS[k] })), { key: 'none' as const, label: 'No category' }],
    });
    if (picked) set('category', picked === 'none' ? null : picked);
  };

  const save = (another: boolean) => {
    const value = parseMoney(valueText);
    const paid = parseMoney(paidText);
    if (nameMissing || !room || !value.ok || !paid.ok) {
      setShowErrors(true);
      warning();
      if (nameMissing) scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const finished: ItemDraft = { ...draft, valueCents: value.cents, pricePaidCents: paid.cents };
    if (editing) {
      const removed = [...editing.photos, ...editing.receipts].map((p) => p.id);
      store.update((d, now) => updateItem(d, editing.id, finished, now));
      void dropPhotos(removed);
    } else {
      if (!canAddItem(store.get(), pro.snapshot().isPro)) {
        router.replace('/pro');
        return;
      }
      store.update((d, now) => addItem(d, finished, now).doc);
      void dropPhotos(imported.current);
    }
    imported.current = [];
    success();
    if (another && canAddItem(store.get(), pro.snapshot().isPro)) {
      // The next one starts in the same room; everything else starts blank.
      setDraft(emptyDraft(finished.roomId));
      setValueText('');
      setPaidText('');
      setShowErrors(false);
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    leave();
  };

  if (params.id && !editing) {
    // The item was deleted while this form was on its way up.
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, padding: space.xxl }}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BarButton label="Close" onPress={leave} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>This item is no longer in your inventory.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit item' : 'New item',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={cancel} />,
          headerRight: () => <BarButton testID="form-save" label="Save" bold onPress={() => save(false)} />,
        }}
      />
      <ScrollView
        ref={scroll}
        testID="item-form"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
        <PhotoStrip
          testID="photos"
          photos={draft.photos}
          busy={importing === 'photos'}
          addLabel="Add a photo"
          icon="addPhoto"
          max={LIMITS.photosPerItem}
          onAdd={() => addPhotos('photos')}
          onRemove={(id) => removePhoto('photos', id)}
        />

        <Card style={{ marginTop: space.l }}>
          <View style={{ paddingHorizontal: space.l, paddingVertical: 10 }}>
            <TextInput
              testID="field-name"
              accessibilityLabel="Name"
              value={draft.name}
              onChangeText={(t) => set('name', t)}
              placeholder="What is it?"
              placeholderTextColor={c.ink3}
              selectionColor={c.green}
              maxLength={LIMITS.name}
              autoFocus={!editing && Platform.OS !== 'web'}
              autoCapitalize="sentences"
              returnKeyType="done"
              style={[type.title, NO_OUTLINE, { color: c.ink, fontSize: 22, lineHeight: 28, paddingVertical: 4 }]}
            />
            {showErrors && nameMissing ? (
              <Text accessibilityRole="alert" testID="error-name" style={[type.footnote, { color: c.red }]}>
                Give it a name so you can find it later.
              </Text>
            ) : null}
          </View>
          <Divider />
          <PickRow testID="field-room" label="Room" value={room?.name ?? null} placeholder="Choose" onPress={pickRoom} />
          <Divider />
          <PickRow testID="field-category" label="Category" value={draft.category ? CATEGORY_LABELS[draft.category] : null} placeholder="None" onPress={pickCategory} />
        </Card>

        <SectionLabel>What it’s worth</SectionLabel>
        <Card>
          <TextRow
            testID="field-value"
            label="Value"
            value={valueText}
            onChangeText={setValueText}
            placeholder="Cost to replace one"
            keyboardType="decimal-pad"
            error={showErrors || valueText !== '' ? valueProblem : null}
          />
          <Divider />
          <FormRow label="How many">
            <Stepper testID="field-quantity" value={draft.quantity} max={LIMITS.quantity} onChange={(n) => set('quantity', n)} />
          </FormRow>
        </Card>
        <Footnote>Your best estimate is fine. If you leave this empty, the price you paid is used instead.</Footnote>

        <SectionLabel>Make and model</SectionLabel>
        <Card>
          <TextRow testID="field-brand" label="Brand" value={draft.brand} onChangeText={(t) => set('brand', t)} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="words" />
          <Divider />
          <TextRow testID="field-model" label="Model" value={draft.model} onChangeText={(t) => set('model', t)} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="characters" autoCorrect={false} />
          <Divider />
          <TextRow testID="field-serial" label="Serial number" value={draft.serial} onChangeText={(t) => set('serial', t)} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="characters" autoCorrect={false} />
        </Card>
        <Footnote>The serial number is usually on a label on the back or underside. Police and insurers ask for it after a theft.</Footnote>

        <SectionLabel>When you bought it</SectionLabel>
        <Card>
          <FormRow label="Date">
            <DateField testID="field-date" value={draft.purchaseDate} onChange={(ymd) => set('purchaseDate', ymd)} />
          </FormRow>
          <Divider />
          <TextRow testID="field-shop" label="Bought from" value={draft.purchasedFrom} onChangeText={(t) => set('purchasedFrom', t)} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="words" />
          <Divider />
          <TextRow
            testID="field-paid"
            label="Price paid"
            value={paidText}
            onChangeText={setPaidText}
            placeholder="Optional"
            keyboardType="decimal-pad"
            error={showErrors || paidText !== '' ? paidProblem : null}
          />
        </Card>

        <SectionLabel>Receipt</SectionLabel>
        <PhotoStrip
          testID="receipts"
          photos={draft.receipts}
          busy={importing === 'receipts'}
          addLabel="Add the receipt"
          icon="receipt"
          max={LIMITS.receiptsPerItem}
          onAdd={() => addPhotos('receipts')}
          onRemove={(id) => removePhoto('receipts', id)}
        />

        <SectionLabel>Notes</SectionLabel>
        <Card>
          <TextInput
            testID="field-notes"
            accessibilityLabel="Notes"
            value={draft.notes}
            onChangeText={(t) => set('notes', t)}
            placeholder="Condition, where the box is, who gave it to you"
            placeholderTextColor={c.ink3}
            selectionColor={c.green}
            multiline
            maxLength={LIMITS.notes}
            style={[type.body, NO_OUTLINE, { color: c.ink, minHeight: 88, padding: space.l, textAlignVertical: 'top' }]}
          />
        </Card>

        <View style={{ marginHorizontal: space.xl, marginTop: space.xxl, gap: space.s }}>
          <Button testID="form-save-bottom" label={editing ? 'Save changes' : 'Save item'} onPress={() => save(false)} />
          {editing ? null : <Button testID="form-save-another" label="Save and add another" kind="soft" onPress={() => save(true)} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
