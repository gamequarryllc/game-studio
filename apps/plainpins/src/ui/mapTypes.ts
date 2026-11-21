import type { StyleProp, ViewStyle } from 'react-native';

import type { Camera } from '@/domain/geo';

// What the map screen asks of a map, whichever one draws it: Apple Maps on the
// iPhone (WorldMap.tsx), a drawn globe on the web preview (WorldMap.web.tsx).

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  color: string;
  /** SF Symbol for the balloon. */
  symbol: string;
}

export interface WorldMapHandle {
  flyTo(camera: Camera): void;
  /** Marks a pin as the chosen one (null for none) without moving the map. */
  select(id: string | null): void;
}

export interface WorldMapProps {
  pins: MapPin[];
  /** Where the map starts. Read once. */
  initial: Camera;
  satellite: boolean;
  selectedId: string | null;
  onPinPress: (id: string) => void;
  onMapPress: () => void;
  /** Told where the middle of the map is whenever it comes to rest. */
  onCamera: (camera: Camera) => void;
  style?: StyleProp<ViewStyle>;
}
