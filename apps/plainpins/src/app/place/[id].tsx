import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toggleFavorite } from '@/domain/actions';
import { CATEGORY_INFO } from '@/domain/categories';
import { weekdayName } from '@/domain/dates';
import { coordText, visitText, whereText } from '@/domain/selectors';
import { success, tap } from '@/platform/haptics';
import { focus } from '@/state/focus';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { CategoryIcon, Icon, type IconName } from '@/ui/Icon';
import { Button, CategoryTag } from '@/ui/kit';
import { PhotoView } from '@/ui/PhotoView';
import { HAIRLINE, radius, serif, space, type, useTheme } from '@/ui/theme';

// One place: its photos across the top, then when, who and what happened.

function HeaderButton({ icon, label, onPress, testID, tint }: { icon: IconName; label: string; onPress: () => void; testID?: string; tint?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={19} color={tint ?? '#FFFDF8'} />
    </Pressable>
  );
}

function Fact({ label, children, testID }: { label: string; children: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.fact, { borderTopColor: c.rule }]}>
      <Text style={[type.margin, { color: c.ink3, width: 76, paddingTop: 3 }]}>{label}</Text>
      <Text testID={testID} style={[type.body, { color: c.ink, flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}

export default function PlaceScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDoc();
  const place = doc.places.find((p) => p.id === id);
  const [page, setPage] = useState(0);

  const width = Math.min(windowWidth, 480);
  const top = insets.top + (Platform.OS === 'web' ? 14 : 4);

  if (!place) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, alignItems: 'center', justifyContent: 'center', padding: space.xxl }} testID="place-missing">
        <Text style={[type.title, { color: c.ink, textAlign: 'center' }]}>This place is no longer on the map</Text>
        <Button label="Back" kind="quiet" onPress={() => goBack(router)} style={{ marginTop: space.l }} />
      </View>
    );
  }

  const info = CATEGORY_INFO[place.category];
  const when = visitText(place.visitedOn, place.until);
  const heroHeight = place.photos.length > 0 ? Math.round(width * 1.08) : top + 150;
  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const openViewer = (index: number) => router.push({ pathname: '/viewer', params: { id: place.id, index: String(index) } });
  const tile = Math.floor((width - space.xl * 2 - 6 * 2) / 3);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} testID="place-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.huge }}>
        <View style={{ height: heroHeight, backgroundColor: place.photos.length > 0 ? '#14110D' : info.color }}>
          {place.photos.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onHeroScroll} scrollEventThrottle={32} testID="place-hero">
              {place.photos.map((photo, index) => (
                <Pressable key={photo.id} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${index + 1} of ${place.photos.length}`} onPress={() => openViewer(index)}>
                  <PhotoView photo={photo} style={{ width, height: heroHeight }} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={{ position: 'absolute', right: -20, bottom: -30, opacity: 0.22 }}>
              <CategoryIcon category={place.category} size={190} color="#FFFDF8" />
            </View>
          )}
          <LinearGradient pointerEvents="none" colors={['rgba(8,12,22,0.55)', 'rgba(8,12,22,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: top + 70 }} />
          {place.photos.length > 0 ? <LinearGradient pointerEvents="none" colors={['rgba(8,12,22,0)', 'rgba(8,12,22,0.78)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 }} /> : null}

          <View pointerEvents="none" style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: space.l }}>
            <Text style={[type.margin, { color: 'rgba(255,253,248,0.82)' }]} numberOfLines={1}>
              {whereText(place) !== '' ? whereText(place) : info.label}
            </Text>
            <Text testID="place-name" accessibilityRole="header" style={[type.placeTitle, { color: '#FFFDF8', marginTop: 4 }]} numberOfLines={3}>
              {place.name}
            </Text>
            {place.photos.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 12 }}>
                {place.photos.slice(0, 12).map((photo, index) => (
                  <View key={photo.id} style={{ width: index === page ? 16 : 5, height: 5, borderRadius: 3, backgroundColor: index === page ? '#FFFDF8' : 'rgba(255,253,248,0.45)' }} />
                ))}
              </View>
            ) : null}
          </View>

          <View style={{ position: 'absolute', left: 14, right: 14, top, flexDirection: 'row', gap: 10 }}>
            <HeaderButton testID="place-back" icon="back" label="Back" onPress={() => goBack(router, '/places')} />
            <View style={{ flex: 1 }} />
            <HeaderButton
              testID="place-favorite"
              icon={place.favorite ? 'heartFill' : 'heart'}
              tint={place.favorite ? '#F3C95A' : undefined}
              label={place.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onPress={() => {
                if (!place.favorite) success();
                store.update((d, now) => toggleFavorite(d, place.id, now));
              }}
            />
            <HeaderButton testID="place-edit" icon="edit" label="Edit" onPress={() => router.push({ pathname: '/place-form', params: { id: place.id } })} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space.xl, paddingTop: space.l }}>
          <CategoryTag category={place.category} />

          {place.story !== '' ? (
            <Text testID="place-story" style={[type.story, { color: c.ink, marginTop: space.l }]}>
              {place.story}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/place-form', params: { id: place.id } })}>
              <Text style={{ fontFamily: serif.italic, fontSize: 20, lineHeight: 28, color: c.ink3, marginTop: space.l }}>What happened here? Add the story.</Text>
            </Pressable>
          )}

          <View style={{ marginTop: space.xl, borderBottomWidth: HAIRLINE, borderBottomColor: c.rule }}>
            {when !== '' ? (
              <Fact label="When" testID="place-when">
                {place.until === null && place.visitedOn ? `${weekdayName(place.visitedOn)}, ${when}` : when}
              </Fact>
            ) : null}
            {place.people.length > 0 ? (
              <View style={[styles.fact, { borderTopColor: c.rule }]}>
                <Text style={[type.margin, { color: c.ink3, width: 76, paddingTop: 7 }]}>With</Text>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID="place-people">
                  {place.people.map((name) => (
                    <View key={name} style={[styles.person, { backgroundColor: c.sunk }]}>
                      <Text style={[type.subhead, { color: c.ink }]}>{name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={[styles.fact, { borderTopColor: c.rule }]}>
              <Text style={[type.margin, { color: c.ink3, width: 76, paddingTop: 2 }]}>Pin</Text>
              <Text style={[type.mono, { color: c.ink2, flex: 1, fontSize: 13 }]} testID="place-coords">
                {coordText(place.lat, place.lng)}
              </Text>
            </View>
          </View>

          <Button
            label="Show on the map"
            icon="pin"
            kind="quiet"
            testID="place-show-map"
            onPress={() => {
              focus.ask(place.id);
              router.dismissTo('/');
            }}
            style={{ marginTop: space.xl }}
          />

          {place.photos.length > 1 ? (
            <>
              <Text style={[type.margin, { color: c.ink2, marginTop: space.xxl, marginBottom: space.m }]}>{`${place.photos.length} photos`}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID="place-grid">
                {place.photos.map((photo, index) => (
                  <Pressable key={photo.id} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${index + 1}`} onPress={() => openViewer(index)}>
                    <PhotoView photo={photo} style={{ width: tile, height: tile, borderRadius: radius.print }} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {place.photos.length === 0 ? (
            <Button label="Add photos" icon="photo" kind="quiet" onPress={() => router.push({ pathname: '/place-form', params: { id: place.id } })} style={{ marginTop: space.m }} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,12,22,0.42)' },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, paddingVertical: 12, borderTopWidth: HAIRLINE },
  person: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
});
