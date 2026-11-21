import { AppleMaps } from 'expo-maps';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import type { WorldMapHandle, WorldMapProps } from './mapTypes';
import { type, useTheme } from './theme';

// The iPhone's map is Apple Maps, drawn with real elevation: zoomed all the way
// out it is a globe you can spin, and it comes down through every level to the
// street. Pins are Apple's own balloons, tinted by kind of place.
// The web preview draws its own globe instead: WorldMap.web.tsx.

const UI = { compassEnabled: true, scaleBarEnabled: false, togglePitchEnabled: false, myLocationButtonEnabled: false } as const;

export const WorldMap = forwardRef<WorldMapHandle, WorldMapProps>(function WorldMap({ pins, initial, satellite, onPinPress, onMapPress, onCamera, style }, ref) {
  const { c } = useTheme();
  const map = useRef<AppleMaps.MapView>(null);
  // The starting position is given once; after that the map is moved by hand or by flyTo.
  const [start] = useState(() => ({ coordinates: { latitude: initial.lat, longitude: initial.lng }, zoom: initial.zoom }));

  useImperativeHandle(
    ref,
    () => ({
      flyTo(camera) {
        void map.current?.setCameraPosition({ coordinates: { latitude: camera.lat, longitude: camera.lng }, zoom: camera.zoom })?.catch(() => {});
      },
      select(id) {
        try {
          map.current?.selectMarker(id ?? undefined, { moveCamera: false });
        } catch {
          // Selection is a nicety (iOS 18 and later); the map works without it.
        }
      },
    }),
    [],
  );

  const markers = useMemo(() => pins.map((p) => ({ id: p.id, coordinates: { latitude: p.lat, longitude: p.lng }, title: p.title, systemImage: p.symbol, tintColor: p.color })), [pins]);

  const properties = useMemo(
    () => ({
      mapType: satellite ? AppleMaps.MapType.HYBRID : AppleMaps.MapType.STANDARD,
      elevation: AppleMaps.MapStyleElevation.REALISTIC,
      selectionEnabled: false,
      isTrafficEnabled: false,
      isMyLocationEnabled: false,
    }),
    [satellite],
  );

  if (Platform.OS !== 'ios') {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: c.sea }]}>
        <Text style={[type.subhead, { color: c.ink2 }]}>The map needs an iPhone.</Text>
      </View>
    );
  }

  return (
    <AppleMaps.View
      ref={map}
      style={style}
      cameraPosition={start}
      markers={markers}
      properties={properties}
      uiSettings={UI}
      onMarkerClick={(marker) => {
        if (marker.id) onPinPress(marker.id);
      }}
      onMapClick={() => onMapPress()}
      onCameraMove={(e) => {
        const { latitude, longitude } = e.coordinates;
        if (typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(e.zoom)) onCamera({ lat: latitude, lng: longitude, zoom: e.zoom });
      }}
    />
  );
});
