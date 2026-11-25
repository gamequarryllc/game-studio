import { requireNativeView } from 'expo';
import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import { SCREEN_TIME_AVAILABLE } from '@/platform/screenTime';

import { GAP, gridHeight, iconSize, squares } from './iconGrid';
import { Icon, type IconName } from './icons';

interface NativeProps {
  selection: string | null;
  size: number;
  gap: number;
  columns: number;
  limit: number;
  style?: StyleProp<ViewStyle>;
}

// Only a build with the Screen Time pieces has this view; asking for it anywhere else would throw.
const NativeIcons = SCREEN_TIME_AVAILABLE ? requireNativeView<NativeProps>('PlainlimitIcons') : null;

/**
 * The person's own app icons in a grid (`count` of them, from `selection`).
 * On an iPhone, iOS draws them: Plainlimit hands back Apple's sealed picks
 * and never learns which apps they are. In a browser, stand-in icons.
 */
export function AppIcons({ selection, count, columns = 6, limit = 0, label }: { selection: string | null; count: number; columns?: number; limit?: number; label: string }) {
  const [width, setWidth] = useState(0);
  const size = iconSize(width, columns);
  const height = width > 0 ? gridHeight(count, columns, size, limit) : 0;
  return (
    <View
      accessible
      accessibilityLabel={label}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      pointerEvents="none"
      style={{ alignSelf: 'stretch', height, minHeight: width > 0 ? 0 : 1 }}>
      {width === 0 || count === 0 ? null : NativeIcons ? (
        <NativeIcons selection={selection} size={size} gap={GAP} columns={columns} limit={limit} style={{ flex: 1 }} />
      ) : (
        <StandIns count={count} columns={columns} size={size} limit={limit} />
      )}
    </View>
  );
}

/** The browser preview's icons: the phone keeps the real ones to itself. */
const STAND_INS: { icon: IconName; bg: string }[] = [
  { icon: 'phone', bg: '#34C759' },
  { icon: 'message', bg: '#34C759' },
  { icon: 'map', bg: '#2F80F5' },
  { icon: 'essentials', bg: '#F5405E' },
  { icon: 'bell', bg: '#F08A24' },
  { icon: 'iphone', bg: '#5B6168' },
  { icon: 'widget', bg: '#3B82F6' },
  { icon: 'tips', bg: '#D9A400' },
  { icon: 'lockMessage', bg: '#14A3A3' },
  { icon: 'history', bg: '#8B5CF6' },
];

function StandIns({ count, columns, size, limit }: { count: number; columns: number; size: number; limit: number }) {
  const shown = squares(count, limit);
  const more = shown < count ? count - shown + 1 : 0;
  const square = (i: number) => {
    const last = more > 0 && i === shown - 1;
    const look = STAND_INS[i % STAND_INS.length];
    return (
      <View key={i} style={{ width: size, height: size, borderRadius: size * 0.225, backgroundColor: last ? '#24272B' : look.bg, alignItems: 'center', justifyContent: 'center' }}>
        {last ? <Text style={{ fontSize: size * 0.34, fontWeight: '600', color: '#A9AEB3' }}>{`+${more}`}</Text> : <Icon name={look.icon} size={size * 0.55} color="#FFFFFF" />}
      </View>
    );
  };
  // Row by row, as on the phone: the icons spread across, and a short last row keeps to the left.
  const rows = Array.from({ length: Math.ceil(shown / columns) }, (_, r) => r * columns);
  return (
    <View style={{ gap: GAP }}>
      {rows.map((start) => (
        <View key={start} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: columns }, (_, k) => (start + k < shown ? square(start + k) : <View key={`gap${k}`} style={{ width: size, height: size }} />))}
        </View>
      ))}
    </View>
  );
}
