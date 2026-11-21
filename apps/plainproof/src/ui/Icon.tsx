import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import type { Category, LossCause, RoomIcon } from '@/domain/types';

// One list of the symbols the app uses. On iPhone these are SF Symbols; the
// web preview shows the nearest Material symbol, since SF Symbols only exist
// on Apple devices.

type Pair = Exclude<SymbolViewProps['name'], string>;

const ICONS = {
  add: { ios: 'plus', web: 'add' },
  minus: { ios: 'minus', web: 'remove' },
  addPhoto: { ios: 'camera.fill', web: 'photo_camera' },
  library: { ios: 'photo.on.rectangle', web: 'photo_library' },
  photo: { ios: 'photo', web: 'image' },
  receipt: { ios: 'doc.text', web: 'receipt_long' },
  tag: { ios: 'tag.fill', web: 'sell' },
  chevron: { ios: 'chevron.right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.up.chevron.down', web: 'unfold_more' },
  search: { ios: 'magnifyingglass', web: 'search' },
  clear: { ios: 'xmark.circle.fill', web: 'cancel' },
  close: { ios: 'xmark', web: 'close' },
  check: { ios: 'checkmark', web: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', web: 'check_circle' },
  circle: { ios: 'circle', web: 'radio_button_unchecked' },
  trash: { ios: 'trash', web: 'delete' },
  edit: { ios: 'pencil', web: 'edit' },
  up: { ios: 'arrow.up', web: 'arrow_upward' },
  down: { ios: 'arrow.down', web: 'arrow_downward' },
  sort: { ios: 'arrow.up.arrow.down', web: 'swap_vert' },
  more: { ios: 'ellipsis', web: 'more_horiz' },
  report: { ios: 'doc.richtext', web: 'description' },
  table: { ios: 'tablecells', web: 'table_view' },
  backup: { ios: 'externaldrive', web: 'backup' },
  restore: { ios: 'arrow.counterclockwise', web: 'restore' },
  lock: { ios: 'lock.fill', web: 'lock' },
  phone: { ios: 'iphone', web: 'phone_iphone' },
  warning: { ios: 'exclamationmark.triangle', web: 'warning' },
  info: { ios: 'info.circle', web: 'info' },
  key: { ios: 'key.fill', web: 'key' },
  video: { ios: 'video.fill', web: 'videocam' },
  play: { ios: 'play.fill', web: 'play_arrow' },
  scan: { ios: 'text.viewfinder', web: 'document_scanner' },
  bell: { ios: 'bell', web: 'notifications' },
  cloud: { ios: 'icloud', web: 'cloud' },
  shield: { ios: 'checkmark.shield', web: 'verified_user' },
  claim: { ios: 'exclamationmark.shield', web: 'gpp_maybe' },
  // Places
  cabinets: { ios: 'tray.2.fill', web: 'dns' },
  building: { ios: 'building.2.fill', web: 'apartment' },
  pin: { ios: 'mappin.and.ellipse', web: 'location_on' },
  tabRooms: { ios: 'house', web: 'home' },
  tabItems: { ios: 'list.bullet.rectangle', web: 'list_alt' },
  tabReport: { ios: 'doc.text', web: 'description' },
  tabSettings: { ios: 'gearshape', web: 'settings' },
  // Rooms
  sofa: { ios: 'sofa.fill', web: 'weekend' },
  bed: { ios: 'bed.double.fill', web: 'bed' },
  kitchen: { ios: 'refrigerator.fill', web: 'kitchen' },
  dining: { ios: 'fork.knife', web: 'restaurant' },
  bath: { ios: 'bathtub.fill', web: 'bathtub' },
  desk: { ios: 'desktopcomputer', web: 'computer' },
  kids: { ios: 'teddybear.fill', web: 'toys' },
  laundry: { ios: 'washer.fill', web: 'local_laundry_service' },
  garage: { ios: 'car.fill', web: 'garage' },
  storage: { ios: 'archivebox.fill', web: 'inventory_2' },
  outdoor: { ios: 'tree.fill', web: 'yard' },
  hall: { ios: 'door.left.hand.closed', web: 'door_front' },
  box: { ios: 'shippingbox.fill', web: 'package_2' },
  // The kinds of thing, for the category picker.
  catElectronics: { ios: 'tv.fill', web: 'tv' },
  catAppliances: { ios: 'washer.fill', web: 'local_laundry_service' },
  catFurniture: { ios: 'chair.lounge.fill', web: 'chair' },
  catJewelry: { ios: 'sparkles', web: 'diamond' },
  catClothing: { ios: 'tshirt.fill', web: 'checkroom' },
  catTools: { ios: 'hammer.fill', web: 'handyman' },
  catKitchenware: { ios: 'cup.and.saucer.fill', web: 'coffee' },
  catArt: { ios: 'paintpalette.fill', web: 'palette' },
  catSports: { ios: 'figure.run', web: 'directions_run' },
  catMusic: { ios: 'guitars.fill', web: 'music_note' },
  catBooks: { ios: 'books.vertical.fill', web: 'menu_book' },
  catOther: { ios: 'square.grid.2x2.fill', web: 'category' },
  // What caused a loss, for the claim.
  causeFire: { ios: 'flame.fill', web: 'local_fire_department' },
  causeSmoke: { ios: 'smoke.fill', web: 'air' },
  causeWater: { ios: 'drop.fill', web: 'water_drop' },
  causeStorm: { ios: 'cloud.bolt.rain.fill', web: 'thunderstorm' },
  causeTheft: { ios: 'lock.open.fill', web: 'lock_open' },
  causeVandalism: { ios: 'hammer.fill', web: 'broken_image' },
  causeAccident: { ios: 'exclamationmark.triangle.fill', web: 'warning' },
  causeOther: { ios: 'questionmark.circle.fill', web: 'help' },
} as const satisfies Record<string, Pair>;

export type IconName = keyof typeof ICONS;

export const roomIconName = (icon: RoomIcon): IconName => icon;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const pair = ICONS[name];
  return <SymbolView name={{ ios: pair.ios, android: pair.web, web: pair.web }} size={size} tintColor={color} style={style} />;
}

const CATEGORY_ICONS: Record<Category, IconName> = {
  electronics: 'catElectronics',
  appliances: 'catAppliances',
  furniture: 'catFurniture',
  jewelry: 'catJewelry',
  clothing: 'catClothing',
  tools: 'catTools',
  kitchenware: 'catKitchenware',
  art: 'catArt',
  sports: 'catSports',
  music: 'catMusic',
  books: 'catBooks',
  other: 'catOther',
};
export const categoryIconName = (category: Category): IconName => CATEGORY_ICONS[category];

const CAUSE_ICONS: Record<LossCause, IconName> = {
  fire: 'causeFire',
  smoke: 'causeSmoke',
  water: 'causeWater',
  storm: 'causeStorm',
  theft: 'causeTheft',
  vandalism: 'causeVandalism',
  accident: 'causeAccident',
  other: 'causeOther',
};
export const causeIconName = (cause: LossCause): IconName => CAUSE_ICONS[cause];
