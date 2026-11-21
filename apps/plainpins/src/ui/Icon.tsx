import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { CATEGORY_INFO } from '@/domain/categories';
import type { Category } from '@/domain/types';

// One list of the symbols the app uses. On iPhone these are SF Symbols; the
// web preview shows the nearest Material symbol, since SF Symbols only exist
// on Apple devices.

type Pair = Exclude<SymbolViewProps['name'], string>;

const ICONS = {
  add: { ios: 'plus', web: 'add' },
  chevron: { ios: 'chevron.right', web: 'chevron_right' },
  back: { ios: 'chevron.left', web: 'chevron_left' },
  search: { ios: 'magnifyingglass', web: 'search' },
  clear: { ios: 'xmark.circle.fill', web: 'cancel' },
  close: { ios: 'xmark', web: 'close' },
  check: { ios: 'checkmark', web: 'check' },
  trash: { ios: 'trash', web: 'delete' },
  edit: { ios: 'pencil', web: 'edit' },
  heart: { ios: 'heart', web: 'favorite_border' },
  heartFill: { ios: 'heart.fill', web: 'favorite' },
  globe: { ios: 'globe.americas.fill', web: 'public' },
  layers: { ios: 'square.2.layers.3d', web: 'layers' },
  locate: { ios: 'location.fill', web: 'near_me' },
  pin: { ios: 'mappin.and.ellipse', web: 'location_on' },
  calendar: { ios: 'calendar', web: 'event' },
  people: { ios: 'person.2.fill', web: 'group' },
  photo: { ios: 'photo.on.rectangle.angled', web: 'photo_library' },
  camera: { ios: 'camera.fill', web: 'photo_camera' },
  backup: { ios: 'externaldrive', web: 'backup' },
  restore: { ios: 'arrow.counterclockwise', web: 'restore' },
  key: { ios: 'key.fill', web: 'key' },
  info: { ios: 'info.circle', web: 'info' },
  warning: { ios: 'exclamationmark.triangle', web: 'warning' },
  lock: { ios: 'lock.fill', web: 'lock' },
  plusZoom: { ios: 'plus', web: 'add' },
  minusZoom: { ios: 'minus', web: 'remove' },
  flask: { ios: 'flask.fill', web: 'science' },
  hand: { ios: 'hand.raised.fill', web: 'privacy_tip' },
  help: { ios: 'questionmark.circle', web: 'help' },
  tabMap: { ios: 'globe.americas.fill', web: 'public' },
  tabPlaces: { ios: 'book.pages.fill', web: 'auto_stories' },
  tabSettings: { ios: 'gearshape.fill', web: 'settings' },
} as const satisfies Record<string, Pair>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<ViewStyle> }) {
  const pair = ICONS[name];
  return <SymbolView name={{ ios: pair.ios, android: pair.web, web: pair.web }} size={size} tintColor={color} style={style} />;
}

export function CategoryIcon({ category, size = 20, color, style }: { category: Category; size?: number; color: ColorValue; style?: StyleProp<ViewStyle> }) {
  const info = CATEGORY_INFO[category];
  const name = { ios: info.sf, android: info.web, web: info.web } as Pair;
  return <SymbolView name={name} size={size} tintColor={color} style={style} />;
}
