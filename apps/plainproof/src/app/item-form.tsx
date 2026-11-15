import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addItem, addRoom, draftFromItem, emptyDraft, isFutureYmd, updateItem, type ItemDraft } from '@/domain/actions';
import { displayYmd, toYmd } from '@/domain/dates';
import { readReceipt, serialCandidates } from '@/domain/scan';
import { canAddItem } from '@/domain/limits';
import { centsToInput, formatMoney, parseMoney, tidyMoneyInput } from '@/domain/money';
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS, LIMITS, type Category, type Condition, type Photo } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { importPhoto, photoFileUri } from '@/platform/photos';
import { canScan, readTextIn } from '@/platform/textScan';
import { pickFromLibrary, takePhoto } from '@/platform/pickImages';
import { pro } from '@/pro/pro';
import { dropPhotos } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { ask, choose, confirm, notify } from '@/ui/dialogs';
import { FormRow, PhotoStrip, PickRow, Stepper, TextRow } from '@/ui/form';
import { BarButton, Button, Card, Divider, Footnote, Row, SectionLabel } from '@/ui/kit';
import { NO_OUTLINE, space, type, useTheme } from '@/ui/theme';

/** An amount as the field shows it: grouped, as it reads after the person moves on. */
function moneyText(cents: number | null): string {
  return tidyMoneyInput(centsToInput(cents));
}

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
  const [valueText, setValueText] = useState(moneyText(initial.valueCents));
  const [paidText, setPaidText] = useState(moneyText(initial.pricePaidCents));
  const [showErrors, setShowErrors] = useState(false);
  /** When the form opened: "today" for the purchase date check. */
  const [openedAt] = useState(() => Date.now());
  const [importing, setImporting] = useState<'photos' | 'receipts' | null>(null);
  const [scanning, setScanning] = useState<'serial' | 'receipt' | null>(null);
  /** Photos imported while this form was open; deleted again if it is cancelled. */
  const imported = useRef<string[]>([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const room = doc.rooms.find((r) => r.id === draft.roomId);
  const nameMissing = draft.name.trim() === '';
  const valueProblem = moneyError(valueText);
  const paidProblem = moneyError(paidText);
  const futureDate = isFutureYmd(draft.purchaseDate, openedAt);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    valueText !== moneyText(initial.valueCents) ||
    paidText !== moneyText(initial.pricePaidCents);

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
        await notify('The camera is switched off for Plainproof', 'You can allow it in the Settings app, under Plainproof.');
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

  /** Reads a serial number off a label: a new photo of it, or one of the item's photos. */
  const scanSerial = async () => {
    const source = await choose<'camera' | 'library' | 'photo'>({
      title: 'Read the serial number',
      message: 'Take a close, sharp photo of the label. The text is read on this iPhone.',
      choices: [
        { key: 'camera', label: 'Photograph the label' },
        { key: 'library', label: 'Choose a photo of it' },
        ...(draft.photos.length > 0 ? [{ key: 'photo' as const, label: 'Use this item’s photos' }] : []),
      ],
    });
    if (!source) return;
    try {
      let uris: string[] = [];
      if (source === 'photo') uris = draft.photos.map((p) => photoFileUri(p.id, 'full')).filter((u): u is string => u !== null);
      else {
        const picked = source === 'camera' ? await takePhoto() : await pickFromLibrary(1);
        if (picked === 'denied') {
          await notify('The camera is switched off for Plainproof', 'You can allow it in the Settings app, under Plainproof.');
          return;
        }
        uris = picked.map((p) => p.uri);
      }
      if (uris.length === 0) return;
      setScanning('serial');
      const lines: string[] = [];
      for (const uri of uris) lines.push(...(await readTextIn(uri)));
      setScanning(null);
      const found = serialCandidates(lines).slice(0, 6);
      if (found.length === 0) {
        await notify('No serial number found', 'Try a closer photo with the label flat and well lit, or type it in.');
        return;
      }
      const picked = await choose({ title: 'Which is the serial number?', message: 'Check it against the label.', choices: found.map((f) => ({ key: f, label: f })) });
      if (picked) set('serial', picked);
    } catch {
      await notify('The label could not be read', 'Try another photo, or type the number in.');
    } finally {
      setScanning(null);
    }
  };

  /** Fills the purchase date, price and shop from the first receipt photo, after asking. */
  const scanReceipt = async () => {
    const first = draft.receipts[0];
    const uri = first ? photoFileUri(first.id, 'full') : null;
    if (!uri) return;
    setScanning('receipt');
    try {
      const guess = readReceipt(await readTextIn(uri), toYmd(new Date()));
      setScanning(null);
      const parts = [guess.date ? displayYmd(guess.date) : null, guess.totalCents !== null ? formatMoney(guess.totalCents, doc.settings.currency) : null, guess.store].filter(Boolean);
      if (parts.length === 0) {
        await notify('Nothing to read', 'No date, total or shop name could be made out. A flatter, brighter photo may help.');
        return;
      }
      const ok = await confirm({ title: 'Fill in from the receipt?', message: `${parts.join(' · ')}\n\nCheck these against the receipt afterwards.`, confirmLabel: 'Fill in' });
      if (!ok) return;
      setDraft((d) => ({ ...d, purchaseDate: guess.date ?? d.purchaseDate, purchasedFrom: guess.store ?? d.purchasedFrom }));
      if (guess.totalCents !== null) setPaidText(moneyText(guess.totalCents));
    } catch {
      await notify('The receipt could not be read', 'Type the details in instead.');
    } finally {
      setScanning(null);
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

  const pickCondition = async () => {
    const picked = await choose<Condition | 'none'>({
      title: 'What condition is it in?',
      message: 'Insurers use this to work out what an older thing is worth.',
      choices: [...CONDITIONS.map((k) => ({ key: k, label: CONDITION_LABELS[k] })), { key: 'none' as const, label: 'Not stated' }],
    });
    if (picked) set('condition', picked === 'none' ? null : picked);
  };

  const save = (another: boolean) => {
    const value = parseMoney(valueText);
    const paid = parseMoney(paidText);
    if (nameMissing || !room || !value.ok || !paid.ok || futureDate) {
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
      if (!canAddItem(store.itemCount(), pro.snapshot().isPro)) {
        router.replace('/pro');
        return;
      }
      store.update((d, now) => addItem(d, finished, now).doc);
      void dropPhotos(imported.current);
    }
    imported.current = [];
    success();
    if (another && canAddItem(store.itemCount(), pro.snapshot().isPro)) {
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
          <Divider />
          <PickRow testID="field-condition" label="Condition" value={draft.condition ? CONDITION_LABELS[draft.condition] : null} placeholder="Not stated" onPress={pickCondition} />
        </Card>

        <SectionLabel>What it’s worth</SectionLabel>
        <Card>
          <TextRow
            testID="field-value"
            label="Value"
            value={valueText}
            onChangeText={setValueText}
            onBlur={() => setValueText((t) => tidyMoneyInput(t))}
            placeholder="Cost to replace one"
            suffix={doc.settings.currency}
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
          {canScan ? (
            <>
              <Divider />
              <Row testID="scan-serial" title={scanning === 'serial' ? 'Reading the label…' : 'Read it off the label'} tint onPress={() => void scanSerial()} />
            </>
          ) : null}
        </Card>
        <Footnote>The serial number is usually on a label on the back or underside. Police and insurers ask for it after a theft.</Footnote>

        <SectionLabel>When you bought it</SectionLabel>
        <Card>
          <FormRow label="Date" error={futureDate ? 'That date hasn’t happened yet.' : null}>
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
            onBlur={() => setPaidText((t) => tidyMoneyInput(t))}
            placeholder="Optional"
            suffix={doc.settings.currency}
            keyboardType="decimal-pad"
            error={showErrors || paidText !== '' ? paidProblem : null}
          />
          <Divider />
          <FormRow label="Warranty until">
            <DateField testID="field-warranty" label="Warranty until" future value={draft.warrantyUntil} onChange={(ymd) => set('warrantyUntil', ymd)} />
          </FormRow>
        </Card>
        <Footnote>A warranty can pay for a repair the insurer won’t. Plainproof can remind you a month before one ends.</Footnote>

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
        {canScan && draft.receipts.length > 0 ? (
          <Card style={{ marginTop: space.m }}>
            <Row testID="scan-receipt" title={scanning === 'receipt' ? 'Reading the receipt…' : 'Fill in the date, price and shop from it'} tint onPress={() => void scanReceipt()} />
          </Card>
        ) : null}

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
