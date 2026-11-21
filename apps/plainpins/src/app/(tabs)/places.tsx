import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_INFO } from '@/domain/categories';
import { NO_FILTER, filterPlaces, groupByYear, isFiltering, sortedPlaces, shortWhere, tally, placesText, visitText, type Filter } from '@/domain/selectors';
import { CATEGORIES, type Category, type Place } from '@/domain/types';
import { tap } from '@/platform/haptics';
import { useDoc } from '@/state/store';
import { CategoryIcon, Icon } from '@/ui/Icon';
import { Button, Chip } from '@/ui/kit';
import { NoPhoto, PhotoView } from '@/ui/PhotoView';
import { HAIRLINE, NO_OUTLINE, TAB_BAR_SPACE, radius, serif, space, type, useTheme } from '@/ui/theme';

// The journal: every place in the order it was visited, newest first, cut
// into years.

function PlaceRow({ place, onPress }: { place: Place; onPress: () => void }) {
  const { c } = useTheme();
  const info = CATEGORY_INFO[place.category];
  const when = visitText(place.visitedOn, place.until);
  return (
    <Pressable testID={`row-${place.id}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed ? { backgroundColor: c.sunk } : null]}>
      {place.photos.length > 0 ? <PhotoView photo={place.photos[0]} style={styles.thumb} /> : <NoPhoto category={place.category} style={styles.thumb} iconSize={24} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.name, { color: c.ink }]} numberOfLines={2}>
          {place.name}
        </Text>
        <Text style={[type.footnote, { color: c.ink2, marginTop: 2 }]} numberOfLines={1}>
          {shortWhere(place)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <CategoryIcon category={place.category} size={12} color={info.color} />
          <Text style={[type.footnote, { color: c.ink2, flex: 1 }]} numberOfLines={1}>
            {when !== '' ? when : 'No date'}
            {place.photos.length > 1 ? ` · ${place.photos.length} photos` : ''}
          </Text>
        </View>
      </View>
      {place.favorite ? <Icon name="heartFill" size={15} color={c.gold} /> : null}
    </Pressable>
  );
}

export default function PlacesScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDoc();
  const [filter, setFilter] = useState<Filter>(NO_FILTER);

  const all = useMemo(() => sortedPlaces(doc), [doc]);
  const shown = useMemo(() => filterPlaces(all, filter), [all, filter]);
  const groups = useMemo(() => groupByYear(shown), [shown]);
  const counts = useMemo(() => tally(doc), [doc]);
  // Only the kinds that are on the map are offered as filters.
  const kinds = useMemo(() => CATEGORIES.filter((k) => all.some((p) => p.category === k)), [all]);
  const anyFavorites = all.some((p) => p.favorite);

  const setCategory = (category: Category | null) => setFilter((f) => ({ ...f, category: f.category === category ? null : category }));

  return (
    <ScrollView
      testID="places-screen"
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 22 : 10), paddingBottom: TAB_BAR_SPACE + space.xl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={{ paddingHorizontal: space.xl }}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: c.ink }]}>
          Places
        </Text>
        {all.length > 0 ? (
          <Text testID="places-tally" style={[type.margin, { color: c.ink2, marginTop: 6 }]}>
            {placesText(counts.places)}
            {counts.photos > 0 ? ` · ${counts.photos} ${counts.photos === 1 ? 'photo' : 'photos'}` : ''}
          </Text>
        ) : null}
      </View>

      {all.length === 0 ? (
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.huge }} testID="places-empty">
          <Text style={[type.title, { color: c.ink }]}>Nothing pinned yet</Text>
          <Text style={[type.body, { color: c.ink2, marginTop: space.s }]}>Each place you add shows up here with its photos, the date and who came along.</Text>
          <Button label="Go to the map" icon="globe" kind="quiet" onPress={() => router.navigate('/')} style={{ marginTop: space.xl, alignSelf: 'flex-start' }} />
        </View>
      ) : (
        <>
          <View style={[styles.search, { backgroundColor: c.sunk }]}>
            <Icon name="search" size={17} color={c.ink3} />
            <TextInput
              testID="places-search"
              value={filter.text}
              onChangeText={(text) => setFilter((f) => ({ ...f, text }))}
              placeholder="A place, a town, a person"
              placeholderTextColor={c.ink3}
              style={[type.body, NO_OUTLINE, { flex: 1, color: c.ink, paddingVertical: 9 }]}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {Platform.OS === 'web' && filter.text !== '' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setFilter((f) => ({ ...f, text: '' }))} hitSlop={8}>
                <Icon name="clear" size={17} color={c.ink3} />
              </Pressable>
            ) : null}
          </View>

          {kinds.length > 1 || anyFavorites ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, gap: 8, paddingVertical: space.m }} keyboardShouldPersistTaps="handled">
              {anyFavorites ? (
                <Chip
                  testID="filter-favorites"
                  label="Favorites"
                  color={c.gold}
                  selected={filter.favoritesOnly}
                  leading={<Icon name="heartFill" size={13} color={filter.favoritesOnly ? '#FFFDF8' : c.gold} />}
                  onPress={() => setFilter((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
                />
              ) : null}
              {kinds.map((k) => (
                <Chip
                  key={k}
                  testID={`filter-${k}`}
                  label={CATEGORY_INFO[k].label}
                  color={CATEGORY_INFO[k].color}
                  selected={filter.category === k}
                  leading={<CategoryIcon category={k} size={13} color={filter.category === k ? '#FFFDF8' : CATEGORY_INFO[k].color} />}
                  onPress={() => setCategory(k)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={{ height: space.m }} />
          )}

          {shown.length === 0 ? (
            <View style={{ paddingHorizontal: space.xl, paddingTop: space.xxl }} testID="places-none">
              <Text style={[type.title, { color: c.ink }]}>No places match</Text>
              <Text style={[type.body, { color: c.ink2, marginTop: space.s }]}>Try fewer words, or take a filter off.</Text>
              {isFiltering(filter) ? <Button label="Show every place" kind="quiet" onPress={() => setFilter(NO_FILTER)} style={{ marginTop: space.l, alignSelf: 'flex-start' }} /> : null}
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.year ?? 'undated'}>
                <View style={[styles.year, { borderBottomColor: c.rule }]}>
                  <Text style={{ fontFamily: serif.italic, fontSize: 30, lineHeight: 34, color: c.accent }}>{group.year ?? 'Sometime'}</Text>
                  <Text style={[type.margin, { color: c.ink3 }]}>{`${group.places.length} ${group.places.length === 1 ? 'place' : 'places'}`}</Text>
                </View>
                {group.places.map((place) => (
                  <PlaceRow
                    key={place.id}
                    place={place}
                    onPress={() => {
                      tap();
                      router.push({ pathname: '/place/[id]', params: { id: place.id } });
                    }}
                  />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.l, marginTop: space.l, paddingHorizontal: 12, borderRadius: radius.m },
  year: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: space.xl, marginTop: space.l, paddingBottom: 6, borderBottomWidth: HAIRLINE },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.xl, paddingVertical: 11 },
  thumb: { width: 72, height: 72, borderRadius: radius.print },
});
