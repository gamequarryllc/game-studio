import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { setMapStyle } from '@/domain/actions';
import { CATEGORY_INFO } from '@/domain/categories';
import { GLOBE_ZOOM, PLACE_ZOOM, cameraFor, type Camera } from '@/domain/geo';
import { coordText, placesText, reachLine, shortWhere, sortedPlaces, tally, visitText } from '@/domain/selectors';
import type { Place } from '@/domain/types';
import { CAN_LOCATE, CAN_SEARCH, describe, locate, search, type Where } from '@/platform/geo';
import { success, tap, thump } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { focus } from '@/state/focus';
import { roomForPlace } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { ask, notify } from '@/ui/dialogs';
import { Icon } from '@/ui/Icon';
import { Button, RoundButton } from '@/ui/kit';
import type { MapPin, WorldMapHandle } from '@/ui/mapTypes';
import { NoPhoto, PhotoView } from '@/ui/PhotoView';
import { FLOAT_SHADOW, HAIRLINE, TAB_BAR_SPACE, radius, space, type, useTheme } from '@/ui/theme';
import { WorldMap } from '@/ui/WorldMap';

// The map: every place as a pin on the globe, and along the bottom a strip of
// their cards. Swiping the cards flies the map from place to place; tapping a
// pin brings up its card.

const GAP = 10;
const SNAP = (Platform.OS === 'web' ? { scrollSnapType: 'x proximity' } : {}) as object;
const SNAP_ITEM = (Platform.OS === 'web' ? { scrollSnapAlign: 'center' } : {}) as object;

function PlaceCard({ place, width, chosen, onPress }: { place: Place; width: number; chosen: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const info = CATEGORY_INFO[place.category];
  const when = visitText(place.visitedOn, place.until);
  return (
    <Pressable
      testID={`card-${place.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}. ${shortWhere(place)}. ${when}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, FLOAT_SHADOW, SNAP_ITEM, { width, backgroundColor: c.card, borderColor: chosen ? info.color : c.glassEdge, opacity: pressed ? 0.9 : 1 }]}>
      {/* The cover is a print with a white edge, a little off square the way a snapshot sits. */}
      <View style={[styles.print, { backgroundColor: '#FFFFFF', transform: [{ rotate: '-2deg' }] }]}>
        {place.photos.length > 0 ? <PhotoView photo={place.photos[0]} style={styles.printImage} /> : <NoPhoto category={place.category} style={styles.printImage} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: info.color }} />
          <Text style={[type.margin, { color: c.ink2, flex: 1 }]} numberOfLines={1}>
            {when !== '' ? when : info.label}
          </Text>
          {place.favorite ? <Icon name="heartFill" size={13} color={c.gold} /> : null}
        </View>
        <Text style={[type.name, { color: c.ink, marginTop: 3 }]} numberOfLines={2}>
          {place.name}
        </Text>
        <Text style={[type.footnote, { color: c.ink2, marginTop: 2 }]} numberOfLines={1}>
          {shortWhere(place)}
        </Text>
      </View>
      <Icon name="chevron" size={13} color={c.ink3} />
    </Pressable>
  );
}

/** The pin that stays in the middle of the screen while a new place is being put down. */
function CenterPin({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.centerPin}>
      <Svg width={44} height={62} viewBox="0 0 44 62">
        <Ellipse cx={22} cy={57} rx={8} ry={3} fill="#000000" opacity={0.25} />
        <Path d="M22 56 C22 56 4 35 4 21 A18 18 0 1 1 40 21 C40 35 22 56 22 56 Z" fill={color} stroke="#FFFDF8" strokeWidth={2.5} />
        <Circle cx={22} cy={21} r={6.5} fill="#FFFDF8" />
      </Svg>
    </View>
  );
}

export default function MapScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const doc = useDoc();
  const { isPro } = usePro();

  const places = useMemo(() => sortedPlaces(doc), [doc]);
  const placesRef = useRef(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);
  const counts = useMemo(() => tally(doc), [doc]);

  const map = useRef<WorldMapHandle>(null);
  const strip = useRef<FlatList<Place>>(null);
  const camera = useRef<Camera | null>(null);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  // A place that has since been deleted is no longer the chosen one.
  const selectedId = pickedId !== null && places.some((p) => p.id === pickedId) ? pickedId : null;
  const selectedRef = useRef<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [center, setCenter] = useState<Camera | null>(null);
  const [looked, setLooked] = useState<{ at: Camera; where: Where | null } | null>(null);
  const [busy, setBusy] = useState<'locate' | 'search' | null>(null);

  const width = Math.min(windowWidth, 480);
  const cardWidth = Math.min(width - 56, 360);
  const side = (width - cardWidth) / 2;
  const cardWidthRef = useRef(cardWidth);
  useEffect(() => {
    cardWidthRef.current = cardWidth;
  }, [cardWidth]);

  const satellite = isPro && doc.settings.mapStyle === 'satellite';

  // The globe opens turned to the latest place.
  const [initial] = useState<Camera>(() => {
    const first = places[0];
    return first ? { lat: Math.max(-45, Math.min(55, first.lat)), lng: first.lng, zoom: GLOBE_ZOOM } : { lat: 30, lng: -45, zoom: GLOBE_ZOOM };
  });

  const pins = useMemo<MapPin[]>(() => places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.name, color: CATEGORY_INFO[p.category].color, symbol: CATEGORY_INFO[p.category].sf })), [places]);

  const stripX = useRef(0);
  const scrollToPlace = useCallback((id: string, animated: boolean) => {
    const index = placesRef.current.findIndex((p) => p.id === id);
    if (index < 0) return;
    const step = cardWidthRef.current + GAP;
    // A card a long way along the strip is jumped to: sliding past dozens of others is only noise.
    const near = Math.abs(index - stripX.current / step) <= 3;
    strip.current?.scrollToOffset({ offset: index * step, animated: animated && near });
  }, []);

  const choose = useCallback(
    (id: string, how: 'pin' | 'card' | 'focus') => {
      const place = placesRef.current.find((p) => p.id === id);
      if (!place) return;
      setSelectedId(id);
      selectedRef.current = id;
      if (how !== 'pin') map.current?.select(id);
      if (how !== 'card') scrollToPlace(id, how === 'pin');
      if (how === 'focus') map.current?.flyTo({ lat: place.lat, lng: place.lng, zoom: PLACE_ZOOM });
      else if (how === 'card') map.current?.flyTo({ lat: place.lat, lng: place.lng, zoom: Math.max(camera.current?.zoom ?? 0, 11) });
    },
    [scrollToPlace],
  );

  // Another screen asked for a place to be shown.
  useFocusEffect(
    useCallback(() => {
      const wanted = focus.take();
      if (!wanted) return;
      const timer = setTimeout(() => choose(wanted, 'focus'), 60);
      return () => clearTimeout(timer);
    }, [choose]),
  );

  // When the whole map is swapped (the sample, a restore, erase everything) the view goes back out to the globe.
  const lastCount = useRef(places.length);
  useEffect(() => {
    const before = lastCount.current;
    lastCount.current = places.length;
    if (Math.abs(places.length - before) <= 1) return;
    const first = places[0];
    selectedRef.current = null;
    map.current?.select(null);
    map.current?.flyTo(first ? { lat: Math.max(-45, Math.min(55, first.lat)), lng: first.lng, zoom: GLOBE_ZOOM } : { lat: 30, lng: -45, zoom: GLOBE_ZOOM });
    strip.current?.scrollToOffset({ offset: 0, animated: false });
  }, [places]);

  // The strip settles on a card: that place becomes the chosen one.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStripScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    stripX.current = x;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const index = Math.max(0, Math.min(placesRef.current.length - 1, Math.round(x / (cardWidthRef.current + GAP))));
      const place = placesRef.current[index];
      // Nothing is chosen until the strip is first moved or a pin is touched, so the globe opens at rest.
      if (place && place.id !== selectedRef.current && (selectedRef.current !== null || x > 4)) {
        tap();
        choose(place.id, 'card');
      }
    }, 140);
  };
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const onCamera = useCallback((cam: Camera) => {
    camera.current = cam;
    setCenter((prev) => (prev && Math.abs(prev.lat - cam.lat) < 1e-6 && Math.abs(prev.lng - cam.lng) < 1e-6 && Math.abs(prev.zoom - cam.zoom) < 1e-3 ? prev : cam));
  }, []);

  // While a pin is being put down, say what is under it.
  useEffect(() => {
    if (!placing || !center) return;
    let live = true;
    const timer = setTimeout(() => {
      void describe(center.lat, center.lng).then((found) => {
        if (live) setLooked({ at: center, where: found });
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [placing, center]);
  // What was found belongs to the spot it was found for; once the map moves on, it is out of date.
  const where = looked !== null && looked.at === center ? looked.where : null;

  const startPlacing = () => {
    if (!roomForPlace(router)) return;
    thump();
    setSelectedId(null);
    selectedRef.current = null;
    map.current?.select(null);
    setPlacing(true);
  };

  const confirmPlacing = () => {
    const at = camera.current ?? center ?? initial;
    success();
    setPlacing(false);
    router.push({
      pathname: '/place-form',
      params: { lat: String(at.lat), lng: String(at.lng), locality: where?.locality ?? '', country: where?.country ?? '', name: where?.name ?? '' },
    });
  };

  const useMyLocation = async () => {
    setBusy('locate');
    const found = await locate();
    setBusy(null);
    if (found.ok) map.current?.flyTo({ lat: found.lat, lng: found.lng, zoom: 15 });
    else if (found.reason === 'denied') await notify('Location is turned off', 'To use where you are now, allow location for this app in the Settings app. You can always move the map by hand instead.');
    else await notify('Couldn’t find where you are', 'Move the map by hand, or try again outside.');
  };

  const searchPlace = async () => {
    const text = await ask({ title: 'Find a place', message: 'A town, an address or a landmark.', placeholder: 'Holland State Park', confirmLabel: 'Find' });
    if (!text || text.trim() === '') return;
    setBusy('search');
    const found = await search(text.trim());
    setBusy(null);
    if (found) map.current?.flyTo({ lat: found.lat, lng: found.lng, zoom: 14 });
    else await notify('Nothing found', 'Try a different spelling, or add the town or country.');
  };

  const toggleGlobe = () => {
    const cam = camera.current ?? initial;
    if (cam.zoom > 3) map.current?.flyTo({ lat: Math.max(-45, Math.min(55, cam.lat)), lng: cam.lng, zoom: GLOBE_ZOOM });
    else if (places.length > 0) map.current?.flyTo(cameraFor(places));
  };

  const toggleStyle = () => {
    if (!isPro) {
      router.push({ pathname: '/pro', params: { why: 'satellite' } });
      return;
    }
    store.update((d, now) => setMapStyle(d, d.settings.mapStyle === 'satellite' ? 'standard' : 'satellite', now));
  };

  const bottom = Platform.OS === 'web' ? TAB_BAR_SPACE : insets.bottom + 62;

  return (
    <View style={{ flex: 1, backgroundColor: c.seaDeep }} testID="map-screen">
      <WorldMap ref={map} style={StyleSheet.absoluteFill} pins={placing ? NO_PINS : pins} initial={initial} satellite={satellite} selectedId={selectedId} onPinPress={(id) => choose(id, 'pin')} onMapPress={() => {}} onCamera={onCamera} />

      {/* The legend in the corner: how much of the world is pinned. */}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + (Platform.OS === 'web' ? 14 : 6) }]}>
        {placing ? (
          <View style={[styles.legend, FLOAT_SHADOW, { backgroundColor: c.glass, borderColor: c.glassEdge }]}>
            <Text style={[type.margin, { color: c.accent }]}>New pin</Text>
            <Text style={[type.title, { color: c.ink }]}>Move the map under the pin</Text>
          </View>
        ) : (
          <View testID="legend" style={[styles.legend, FLOAT_SHADOW, { backgroundColor: c.glass, borderColor: c.glassEdge }]}>
            <Text style={[type.margin, { color: c.accent }]}>Been there</Text>
            <Text testID="legend-count" style={[type.title, { color: c.ink }]} numberOfLines={1}>
              {counts.places === 0 ? 'Nowhere yet' : placesText(counts.places)}
            </Text>
            {reachLine(counts) !== '' ? (
              <Text testID="legend-reach" style={[type.footnote, { color: c.ink2 }]} numberOfLines={1}>
                {reachLine(counts)}
              </Text>
            ) : null}
          </View>
        )}
        <View style={{ flex: 1 }} />
        {placing ? null : (
          <View style={{ gap: 10 }}>
            <RoundButton testID="add-place" icon="add" label="Add a place" onPress={startPlacing} active />
            <RoundButton testID="globe-button" icon="globe" label="Whole globe" onPress={toggleGlobe} />
            <RoundButton testID="style-button" icon="layers" label={satellite ? 'Show the street map' : 'Show satellite'} onPress={toggleStyle} />
          </View>
        )}
      </View>

      {placing ? <CenterPin color={c.accent} /> : null}

      {placing ? (
        <View style={[styles.sheet, FLOAT_SHADOW, { bottom, backgroundColor: c.card, borderColor: c.glassEdge }]} testID="placing-sheet">
          <Text style={[type.name, { color: c.ink }]} numberOfLines={1}>
            {where && (where.name !== '' || where.locality !== '') ? (where.name !== '' ? where.name : where.locality) : 'Somewhere on Earth'}
          </Text>
          <Text style={[type.mono, { color: c.ink2, marginTop: 3 }]} testID="placing-coords">
            {center ? coordText(center.lat, center.lng) : ' '}
            {where && where.name !== '' && where.locality !== '' ? `  ·  ${where.locality}` : ''}
          </Text>
          {CAN_LOCATE || CAN_SEARCH ? (
            <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
              {CAN_LOCATE ? <Button kind="quiet" icon="locate" label="Where I am" busy={busy === 'locate'} onPress={useMyLocation} style={{ flex: 1, minHeight: 44 }} /> : null}
              {CAN_SEARCH ? <Button kind="quiet" icon="search" label="Find a place" busy={busy === 'search'} onPress={searchPlace} style={{ flex: 1, minHeight: 44 }} /> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
            <Button kind="quiet" label="Cancel" testID="placing-cancel" onPress={() => setPlacing(false)} style={{ flex: 1 }} />
            <Button label="Put the pin here" testID="placing-confirm" onPress={confirmPlacing} style={{ flex: 2 }} />
          </View>
        </View>
      ) : places.length === 0 ? (
        <View style={[styles.sheet, FLOAT_SHADOW, { bottom, backgroundColor: c.card, borderColor: c.glassEdge }]} testID="map-empty">
          <Text style={[type.title, { color: c.ink }]}>Where have you been?</Text>
          <Text style={[type.subhead, { color: c.ink2, marginTop: 4 }]}>Put a pin on a place you’ve visited, then add the photos and the story.</Text>
          <Button label="Drop the first pin" icon="add" testID="map-empty-add" onPress={startPlacing} style={{ marginTop: space.m }} />
        </View>
      ) : (
        <FlatList
          ref={strip}
          testID="place-strip"
          style={[{ position: 'absolute', left: 0, right: 0, bottom, flexGrow: 0 }, SNAP]}
          data={places}
          keyExtractor={(p) => p.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={cardWidth + GAP}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: side, paddingTop: 14, paddingBottom: 16, gap: GAP }}
          getItemLayout={(_d, index) => ({ length: cardWidth + GAP, offset: (cardWidth + GAP) * index, index })}
          initialNumToRender={3}
          windowSize={5}
          onScroll={onStripScroll}
          scrollEventThrottle={32}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              width={cardWidth}
              chosen={item.id === selectedId}
              onPress={() => {
                tap();
                if (item.id === selectedId) router.push({ pathname: '/place/[id]', params: { id: item.id } });
                else choose(item.id, 'focus');
              }}
            />
          )}
        />
      )}
    </View>
  );
}

const NO_PINS: MapPin[] = [];

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14 },
  legend: { borderRadius: radius.m, borderWidth: HAIRLINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 9, maxWidth: '78%' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.l, borderWidth: 1.5, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, minHeight: 112 },
  print: { padding: 4, paddingBottom: 9, borderRadius: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  printImage: { width: 76, height: 70, borderRadius: 1 },
  centerPin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -56 },
  sheet: { position: 'absolute', left: 14, right: 14, borderRadius: radius.l, borderWidth: HAIRLINE, padding: space.l },
});
