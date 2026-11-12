import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import type { ThingIcon } from '@/domain/types';

// One list of the symbols the app uses. On iPhone these are SF Symbols; the
// web preview shows the nearest Material symbol, since SF Symbols only exist
// on Apple devices.

type Pair = Exclude<SymbolViewProps['name'], string>;

const ICONS = {
  add: { ios: 'plus', web: 'add' },
  chevron: { ios: 'chevron.right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.up.chevron.down', web: 'unfold_more' },
  search: { ios: 'magnifyingglass', web: 'search' },
  clear: { ios: 'xmark.circle.fill', web: 'cancel' },
  close: { ios: 'xmark', web: 'close' },
  check: { ios: 'checkmark', web: 'check' },
  trash: { ios: 'trash', web: 'delete' },
  edit: { ios: 'pencil', web: 'edit' },
  more: { ios: 'ellipsis', web: 'more_horiz' },
  bell: { ios: 'bell', web: 'notifications' },
  bellOff: { ios: 'bell.slash', web: 'notifications_off' },
  gauge: { ios: 'gauge.with.needle', web: 'speed' },
  note: { ios: 'text.alignleft', web: 'notes' },
  report: { ios: 'doc.richtext', web: 'description' },
  table: { ios: 'tablecells', web: 'table_view' },
  backup: { ios: 'externaldrive', web: 'backup' },
  restore: { ios: 'arrow.counterclockwise', web: 'restore' },
  warning: { ios: 'exclamationmark.triangle', web: 'warning' },
  info: { ios: 'info.circle', web: 'info' },
  key: { ios: 'key.fill', web: 'key' },
  pause: { ios: 'moon.zzz', web: 'bedtime' },
  repeat: { ios: 'arrow.triangle.2.circlepath', web: 'autorenew' },
  calendar: { ios: 'calendar', web: 'event' },
  skip: { ios: 'forward.end', web: 'skip_next' },
  tabDue: { ios: 'checklist', web: 'checklist' },
  tabThings: { ios: 'square.grid.2x2', web: 'grid_view' },
  tabLog: { ios: 'book.closed', web: 'menu_book' },
  tabSettings: { ios: 'gearshape', web: 'settings' },
  // Things
  house: { ios: 'house.fill', web: 'home' },
  apartment: { ios: 'building.2.fill', web: 'apartment' },
  cabin: { ios: 'tent.fill', web: 'cabin' },
  car: { ios: 'car.fill', web: 'directions_car' },
  truck: { ios: 'truck.pickup.side.fill', web: 'local_shipping' },
  motorcycle: { ios: 'motorcycle.fill', web: 'two_wheeler' },
  camper: { ios: 'bus.fill', web: 'airport_shuttle' },
  boat: { ios: 'sailboat.fill', web: 'sailing' },
  bicycle: { ios: 'bicycle', web: 'pedal_bike' },
  mower: { ios: 'leaf.fill', web: 'grass' },
  tools: { ios: 'wrench.and.screwdriver.fill', web: 'construction' },
  box: { ios: 'shippingbox.fill', web: 'inventory_2' },
} as const satisfies Record<string, Pair>;

export type IconName = keyof typeof ICONS;

export const thingIconName = (icon: ThingIcon): IconName => icon;

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<ViewStyle> }) {
  const pair = ICONS[name];
  return <SymbolView name={{ ios: pair.ios, android: pair.web, web: pair.web }} size={size} tintColor={color} style={style} />;
}
