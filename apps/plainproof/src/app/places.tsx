import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PLACE_KINDS,
  PLACE_KIND_LABELS,
  addPlace,
  canAddPlace,
  placeSummaries,
  renamePlace,
  setPlaceKind,
  switchPlace,
  type PlaceKind,
  type PlaceSummary,
} from '@/domain/library';
import { formatMoney } from '@/domain/money';
import { plural } from '@/domain/selectors';
import { success, tap } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { deletePlace } from '@/state/operations';
import { store, useLibrary } from '@/state/store';
import { CabinetArt } from '@/ui/CabinetArt';
import { ask, choose, confirm } from '@/ui/dialogs';
import { Icon, type IconName } from '@/ui/Icon';
import { BarButton } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

// Every place the app keeps, each one a file cabinet. Tapping a cabinet opens
// its drawer (the Rooms tab). The free version keeps one place; Pro adds more.

const KIND_ICONS: Record<PlaceKind, IconName> = {
  home: 'tabRooms',
  rental: 'key',
  office: 'building',
  storage: 'box',
  other: 'pin',
};

const KIND_CHOICES = PLACE_KINDS.map((key) => ({ key, label: PLACE_KIND_LABELS[key] }));

export default function PlacesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const library = useLibrary();
  const { isPro } = usePro();
  const places = placeSummaries(library);
  const mayAdd = canAddPlace(library, isPro);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const open = (place: PlaceSummary) => {
    tap();
    store.updateLibrary((lib) => switchPlace(lib, place.id));
    close();
  };

  const add = async () => {
    if (!mayAdd) {
      router.push('/pro');
      return;
    }
    const name = await ask({ title: 'New place', placeholder: 'Lake cabin, the office, unit 12', confirmLabel: 'Next' });
    if (!name?.trim()) return;
    const kind = await choose({ title: 'What kind of place is it?', choices: KIND_CHOICES });
    if (!kind) return;
    store.updateLibrary((lib, now) => addPlace(lib, name, kind, now).library);
    success();
    close();
  };

  const more = async (place: PlaceSummary) => {
    const what = await choose<'rename' | 'kind' | 'delete'>({
      title: place.name,
      choices: [
        { key: 'rename', label: 'Rename' },
        { key: 'kind', label: 'Change the kind of place' },
        ...(places.length > 1 ? [{ key: 'delete' as const, label: 'Delete this place', destructive: true }] : []),
      ],
    });
    if (what === 'rename') {
      const name = await ask({ title: 'Rename this place', initial: place.name, confirmLabel: 'Save' });
      if (name?.trim()) store.updateLibrary((lib) => renamePlace(lib, place.id, name));
    } else if (what === 'kind') {
      const kind = await choose({ title: 'What kind of place is it?', choices: KIND_CHOICES });
      if (kind) store.updateLibrary((lib) => setPlaceKind(lib, place.id, kind));
    } else if (what === 'delete') {
      const sure = await confirm({
        title: `Delete ${place.name}?`,
        message: place.count > 0 ? `Its ${plural(place.count, 'item')} and their photos will be deleted. This can’t be undone.` : 'There is nothing in it.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (sure) await deletePlace(place.id);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: 'Places', headerLeft: () => <BarButton testID="places-close" label="Close" onPress={close} /> }} />
      <ScrollView testID="places-screen" contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.grid}>
          {places.map((p) => (
            <View key={p.id} style={styles.cell}>
              <Pressable
                testID={`place-${p.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: p.current }}
                accessibilityLabel={`${p.name}, ${PLACE_KIND_LABELS[p.kind]}, ${plural(p.count, 'item')}${p.current ? ', open now' : ''}`}
                onPress={() => open(p)}
                style={({ pressed }) => [styles.tile, { backgroundColor: c.card, borderColor: p.current ? c.green : c.rule, opacity: pressed ? 0.8 : 1 }]}>
                <View style={styles.art}>
                  <CabinetArt open={p.current} />
                </View>
                {p.current ? (
                  <View testID={`place-open-${p.name}`} style={[styles.openMark, { backgroundColor: c.green }]}>
                    <Icon name="check" size={12} color={c.onGreen} />
                  </View>
                ) : null}
                <View style={styles.nameRow}>
                  <Icon name={KIND_ICONS[p.kind]} size={15} color={p.current ? c.green : c.ink2} />
                  <Text testID={`place-name-${p.name}`} style={[type.headline, { color: c.ink, flexShrink: 1 }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </View>
                <Text testID={`place-sum-${p.name}`} style={[type.footnote, type.tabular, { color: c.ink2, textAlign: 'center' }]} numberOfLines={1}>
                  {p.count === 0 ? 'Nothing in it yet' : `${formatMoney(p.totalCents, p.currency, { whole: true })} · ${plural(p.count, 'item')}`}
                </Text>
              </Pressable>
              <Pressable
                testID={`place-more-${p.name}`}
                accessibilityRole="button"
                accessibilityLabel={`More for ${p.name}`}
                hitSlop={8}
                onPress={() => more(p)}
                style={styles.more}>
                <Icon name="more" size={18} color={c.ink2} />
              </Pressable>
            </View>
          ))}
          <View style={styles.cell}>
            <Pressable
              testID="place-add"
              accessibilityRole="button"
              accessibilityLabel={mayAdd ? 'Add a place' : 'Add a place, with Pro'}
              onPress={add}
              style={({ pressed }) => [styles.tile, { borderColor: 'transparent', opacity: pressed ? 0.7 : 1 }]}>
              <View style={styles.art}>
                <CabinetArt empty />
              </View>
              <View style={styles.nameRow}>
                <Text style={[type.headline, { color: c.green }]}>Add a place</Text>
                {mayAdd ? null : (
                  <View style={[styles.pill, { backgroundColor: c.greenSoft }]}>
                    <Text testID="place-add-pro" style={[type.caption, { color: c.green, fontWeight: '700' }]}>
                      Pro
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[type.footnote, { color: c.ink2, textAlign: 'center' }]} numberOfLines={1}>
                Rental, office, storage
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.s },
  cell: { width: '50%', padding: space.s },
  tile: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.l, alignItems: 'center', gap: 4 },
  art: { width: '72%', marginBottom: space.s },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  openMark: { position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', top: space.s + 8, right: space.s + 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
});
