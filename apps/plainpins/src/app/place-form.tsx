import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addPlace, draftOf, draftProblem, droppedFiles, removePlace, updatePlace, type PlaceDraft } from '@/domain/actions';
import { CATEGORY_INFO } from '@/domain/categories';
import { todayYmd } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { FREE_PHOTO_LIMIT, photoLimit, photoRoom } from '@/domain/limits';
import { coordText, knownPeople } from '@/domain/selectors';
import { CATEGORIES, LIMITS, type Photo } from '@/domain/types';
import { success, tap, warning } from '@/platform/haptics';
import { CAN_TAKE_PHOTO, pickFromLibrary, takePhoto, type PickResult } from '@/platform/photos';
import { usePro } from '@/pro/pro';
import { focus } from '@/state/focus';
import { goBack } from '@/state/nav';
import { dropPhotos } from '@/state/operations';
import { useToday } from '@/state/clock';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { choose, confirm, notify } from '@/ui/dialogs';
import { CategoryIcon, Icon } from '@/ui/Icon';
import { BarButton, Card, Chip, Divider, Footnote, MarginLabel, Row } from '@/ui/kit';
import { PhotoView } from '@/ui/PhotoView';
import { HAIRLINE, NO_OUTLINE, radius, serif, space, type, useTheme } from '@/ui/theme';

// Adding a place, or changing one: its photos first, then the name, when,
// who and what happened.

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export default function PlaceForm() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; lat?: string; lng?: string; locality?: string; country?: string; name?: string }>();
  const doc = useDoc();
  const { isPro } = usePro();
  const existing = params.id ? doc.places.find((p) => p.id === params.id) : undefined;

  const [draft, setDraft] = useState<PlaceDraft>(() =>
    existing
      ? draftOf(existing)
      : {
          name: params.name ?? '',
          category: 'other',
          lat: num(params.lat),
          lng: num(params.lng),
          locality: params.locality ?? '',
          country: params.country ?? '',
          visitedOn: todayYmd(Date.now()),
          until: null,
          story: '',
          people: [],
          photos: [],
          favorite: false,
        },
  );
  // The kind already chosen leads the row, so it is in view when the form opens.
  const [kinds] = useState(() => (draft.category === 'other' ? [...CATEGORIES] : [draft.category, ...CATEGORIES.filter((k) => k !== draft.category)]));
  const [original] = useState<Photo[]>(() => existing?.photos ?? []);
  const [person, setPerson] = useState('');
  const [adding, setAdding] = useState(false);
  const saved = useRef(false);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [gone, setGone] = useState(false);

  // Photos picked in a form that is closed without saving are not kept.
  useEffect(
    () => () => {
      if (!saved.current) dropPhotos(droppedFiles(draftRef.current.photos, original));
    },
    [original],
  );

  const set = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const today = useToday();
  const limit = photoLimit(isPro);
  const room = photoRoom(draft.photos.length, isPro);

  const suggestions = useMemo(() => {
    const have = new Set(draft.people.map((p) => p.toLowerCase()));
    const typed = person.trim().toLowerCase();
    return knownPeople(doc)
      .filter((name) => !have.has(name.toLowerCase()) && (typed === '' || name.toLowerCase().includes(typed)))
      .slice(0, 8);
  }, [doc, draft.people, person]);

  const addPerson = (name: string) => {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.person);
    setPerson('');
    if (clean === '' || draft.people.some((p) => p.toLowerCase() === clean.toLowerCase()) || draft.people.length >= LIMITS.people) return;
    tap();
    set('people', [...draft.people, clean]);
  };

  const takeIn = async (work: () => Promise<PickResult>) => {
    if (adding) return;
    setAdding(true);
    try {
      const result = await work();
      if (result.denied) await notify('The camera is turned off', 'Allow the camera for this app in the Settings app, or choose a photo from your library instead.');
      if (result.photos.length > 0) setDraft((d) => ({ ...d, photos: [...d.photos, ...result.photos].slice(0, LIMITS.photos) }));
      if (result.failed > 0) await notify(result.failed === 1 ? 'One photo couldn’t be added' : `${result.failed} photos couldn’t be added`, 'They may be in a format this app can’t read.');
    } catch {
      await notify('Photos couldn’t be added', 'Try again in a moment.');
    } finally {
      setAdding(false);
    }
  };

  const addPhotos = async () => {
    if (room <= 0) {
      if (isPro) await notify(`A place holds ${LIMITS.photos} photos`, 'Remove one to add another.');
      else router.push({ pathname: '/pro', params: { why: 'photos' } });
      return;
    }
    if (!CAN_TAKE_PHOTO) {
      await takeIn(() => pickFromLibrary(room));
      return;
    }
    const how = await choose({ choices: [{ key: 'library', label: 'Choose from library' }, { key: 'camera', label: 'Take a photo' }] });
    if (how === 'library') await takeIn(() => pickFromLibrary(room));
    else if (how === 'camera') await takeIn(takePhoto);
  };

  const photoMenu = async (photo: Photo, index: number) => {
    const picked = await choose({
      choices: [...(index > 0 ? [{ key: 'cover' as const, label: 'Make this the cover' }] : []), { key: 'remove' as const, label: 'Remove photo', destructive: true }],
    });
    if (picked === 'cover') setDraft((d) => ({ ...d, photos: [photo, ...d.photos.filter((p) => p.id !== photo.id)] }));
    else if (picked === 'remove') setDraft((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photo.id) }));
  };

  const close = () => goBack(router, '/');

  const save = async () => {
    // A name half-typed in the "who" box counts.
    const people = person.trim() !== '' && !draft.people.some((p) => p.toLowerCase() === person.trim().toLowerCase()) ? [...draft.people, person.trim()] : draft.people;
    const final = { ...draft, people };
    const problem = draftProblem(final);
    if (problem) {
      warning();
      await notify(problem);
      return;
    }
    saved.current = true;
    if (existing) {
      store.update((d, now) => updatePlace(d, existing.id, final, now));
      dropPhotos(droppedFiles(original, final.photos));
      success();
      close();
    } else {
      const id = newId();
      store.update((d, now) => addPlace(d, final, now, id));
      success();
      focus.ask(id);
      close();
    }
  };

  const remove = async () => {
    if (!existing) return;
    const sure = await confirm({ title: `Delete ${existing.name}?`, message: 'The pin, its story and its photos are removed from this app. Photos in your library are not touched.', confirmLabel: 'Delete place', destructive: true });
    if (!sure) return;
    saved.current = true;
    setGone(true);
    warning();
    store.update((d, now) => removePlace(d, existing.id, now));
    dropPhotos(droppedFiles([...original, ...draft.photos], []));
    router.dismissTo('/places');
  };

  const cancel = async () => {
    const changed = existing ? JSON.stringify(draftOf(existing)) !== JSON.stringify(draft) : draft.name.trim() !== '' || draft.story.trim() !== '' || draft.photos.length > 0 || draft.people.length > 0;
    if (changed) {
      const sure = await confirm({ title: existing ? 'Discard your changes?' : 'Discard this place?', confirmLabel: 'Discard', destructive: true, cancelLabel: 'Keep editing' });
      if (!sure) return;
    }
    close();
  };

  if (params.id && !existing && !gone) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, alignItems: 'center', justifyContent: 'center' }}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BarButton label="Close" onPress={close} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>This place is no longer on the map.</Text>
      </View>
    );
  }

  const addTile = (
    <Pressable testID="form-add-photos" accessibilityRole="button" accessibilityLabel="Add photos" onPress={addPhotos} style={({ pressed }) => [styles.photo, styles.addPhoto, { borderColor: c.ink3, backgroundColor: pressed ? c.sunk : 'transparent', width: draft.photos.length === 0 ? 220 : 104 }]}>
            <Icon name={room <= 0 && !isPro ? 'lock' : 'photo'} size={24} color={c.accent} />
            <Text style={[type.footnote, { color: c.accent, fontWeight: '600', marginTop: 6 }]}>{adding ? 'Adding…' : draft.photos.length === 0 ? 'Add photos' : 'Add more'}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit place' : 'New place',
          headerLeft: () => <BarButton testID="form-cancel" label="Cancel" onPress={cancel} />,
          headerRight: () => <BarButton testID="form-save" label="Save" bold onPress={save} />,
        }}
      />
      <ScrollView testID="place-form" contentContainerStyle={{ paddingBottom: insets.bottom + space.huge }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        {/* Photos */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, paddingTop: space.l, gap: 10 }} keyboardShouldPersistTaps="handled">
          {draft.photos.length > 0 ? addTile : null}
          {draft.photos.map((photo, index) => (
            <Pressable key={photo.id} testID={`form-photo-${index}`} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${index + 1}${index === 0 ? ', the cover' : ''}`} onPress={() => photoMenu(photo, index)}>
              <PhotoView photo={photo} style={styles.photo} />
              {index === 0 ? (
                <View style={styles.cover}>
                  <Text style={[type.margin, { color: '#FFFDF8', fontSize: 9 }]}>Cover</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
          {draft.photos.length === 0 ? addTile : null}
        </ScrollView>
        <Footnote>
          {draft.photos.length === 0
            ? 'Copies are kept inside this app, so they stay with the place.'
            : `${draft.photos.length} of ${limit}. Tap a photo to make it the cover or remove it.${!isPro && room <= 0 ? ` Pro holds ${LIMITS.photos} on each place.` : ''}`}
        </Footnote>

        {/* Name */}
        <View style={{ paddingHorizontal: space.xl, marginTop: space.xl }}>
          <Text style={[type.margin, { color: c.ink2 }]}>Name</Text>
          <TextInput
            testID="form-name"
            value={draft.name}
            onChangeText={(v) => set('name', v)}
            placeholder="Holland State Park"
            placeholderTextColor={c.ink3}
            maxLength={LIMITS.name}
            autoFocus={!existing && Platform.OS !== 'web'}
            autoCapitalize="words"
            returnKeyType="done"
            style={[NO_OUTLINE, { fontFamily: serif.regular, fontSize: 30, lineHeight: 36, color: c.ink, paddingVertical: 6, borderBottomWidth: HAIRLINE, borderBottomColor: c.rule }]}
          />
        </View>

        {/* Kind */}
        <MarginLabel>What kind of place</MarginLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.l }} keyboardShouldPersistTaps="handled">
          {kinds.map((k) => (
            <Chip
              key={k}
              testID={`form-kind-${k}`}
              label={CATEGORY_INFO[k].label}
              color={CATEGORY_INFO[k].color}
              selected={draft.category === k}
              leading={<CategoryIcon category={k} size={14} color={draft.category === k ? '#FFFDF8' : CATEGORY_INFO[k].color} />}
              onPress={() => set('category', k)}
            />
          ))}
        </ScrollView>

        {/* When */}
        <MarginLabel>When you were there</MarginLabel>
        <Card>
          <View style={styles.formRow}>
            <Text style={[type.body, { color: c.ink, flex: 1 }]}>{draft.until ? 'From' : 'Date'}</Text>
            <DateField testID="form-date" value={draft.visitedOn} max={today} onChange={(v) => setDraft((d) => ({ ...d, visitedOn: v, until: v === null || (d.until !== null && d.until <= v) ? null : d.until }))} />
          </View>
          {draft.visitedOn !== null ? (
            <>
              <Divider />
              <View style={styles.formRow}>
                <Text style={[type.body, { color: c.ink, flex: 1 }]}>Until</Text>
                <DateField testID="form-until" label="Last day" emptyLabel="Add a last day" value={draft.until} min={draft.visitedOn} max={today} onChange={(v) => set('until', v !== null && draft.visitedOn !== null && v > draft.visitedOn ? v : null)} />
              </View>
            </>
          ) : null}
        </Card>

        {/* Who */}
        <MarginLabel>Who was there</MarginLabel>
        <View style={{ paddingHorizontal: space.l }}>
          {draft.people.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }} testID="form-people">
              {draft.people.map((name) => (
                <Chip key={name} label={name} onRemove={() => set('people', draft.people.filter((p) => p !== name))} />
              ))}
            </View>
          ) : null}
          <View style={[styles.input, { backgroundColor: c.card, borderColor: c.rule }]}>
            <Icon name="people" size={17} color={c.ink3} />
            <TextInput
              testID="form-person"
              value={person}
              onChangeText={(v) => (v.endsWith(',') ? addPerson(v.slice(0, -1)) : setPerson(v))}
              onSubmitEditing={() => addPerson(person)}
              placeholder="Add a name"
              placeholderTextColor={c.ink3}
              maxLength={LIMITS.person}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              submitBehavior="submit"
              style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, paddingVertical: 11 }]}
            />
            {person.trim() !== '' ? (
              <Pressable testID="form-person-add" accessibilityRole="button" accessibilityLabel="Add this name" hitSlop={8} onPress={() => addPerson(person)}>
                <Text style={[type.body, { color: c.accent, fontWeight: '600' }]}>Add</Text>
              </Pressable>
            ) : null}
          </View>
          {suggestions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }} keyboardShouldPersistTaps="handled">
              {suggestions.map((name) => (
                <Chip key={name} testID={`form-suggest-${name}`} label={name} leading={<Icon name="add" size={12} color={c.ink3} />} onPress={() => addPerson(name)} />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* Story */}
        <MarginLabel>What you did</MarginLabel>
        <View style={{ paddingHorizontal: space.l }}>
          <TextInput
            testID="form-story"
            value={draft.story}
            onChangeText={(v) => set('story', v)}
            placeholder="The swim out to the sandbar, the sunset, the ice cream after."
            placeholderTextColor={c.ink3}
            maxLength={LIMITS.story}
            multiline
            textAlignVertical="top"
            style={[NO_OUTLINE, styles.story, type.story, { color: c.ink, backgroundColor: c.card, borderColor: c.rule }]}
          />
        </View>

        {/* Where */}
        <MarginLabel>Where it is</MarginLabel>
        <Card>
          <View style={styles.formRow}>
            <Text style={[type.body, { color: c.ink, width: 86 }]}>Town</Text>
            <TextInput testID="form-locality" value={draft.locality} onChangeText={(v) => set('locality', v)} placeholder="Town, region" placeholderTextColor={c.ink3} maxLength={LIMITS.locality} autoCapitalize="words" style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, textAlign: 'right' }]} />
          </View>
          <Divider />
          <View style={styles.formRow}>
            <Text style={[type.body, { color: c.ink, width: 86 }]}>Country</Text>
            <TextInput testID="form-country" value={draft.country} onChangeText={(v) => set('country', v)} placeholder="Country" placeholderTextColor={c.ink3} maxLength={LIMITS.locality} autoCapitalize="words" style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, textAlign: 'right' }]} />
          </View>
          <Divider />
          <View style={styles.formRow}>
            <Text style={[type.body, { color: c.ink, flex: 1 }]}>Pin</Text>
            <Text style={[type.mono, { color: c.ink2 }]} testID="form-coords">
              {Number.isFinite(draft.lat) && Number.isFinite(draft.lng) ? coordText(draft.lat, draft.lng) : 'Not placed'}
            </Text>
          </View>
        </Card>

        <Card style={{ marginTop: space.xl }}>
          <View style={styles.formRow}>
            <Icon name="heartFill" size={18} color={c.gold} style={{ marginRight: space.m }} />
            <Text style={[type.body, { color: c.ink, flex: 1 }]}>A favorite</Text>
            <Switch testID="form-favorite" value={draft.favorite} onValueChange={(v) => set('favorite', v)} trackColor={{ true: c.accent, false: c.sunk }} />
          </View>
        </Card>

        {existing ? (
          <Card style={{ marginTop: space.xl }}>
            <Row testID="form-delete" title="Delete this place" icon="trash" destructive onPress={remove} />
          </Card>
        ) : !isPro ? (
          <Footnote>{`The free version holds ${FREE_PHOTO_LIMIT} photos on each place.`}</Footnote>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 104, height: 104, borderRadius: radius.print },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed' },
  cover: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: 'rgba(8,12,22,0.62)' },
  formRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, minHeight: 50, paddingVertical: 8 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.m, borderWidth: HAIRLINE },
  story: { minHeight: 130, borderRadius: radius.m, borderWidth: HAIRLINE, padding: 14 },
});
