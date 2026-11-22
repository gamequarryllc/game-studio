import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import type { SFSymbol } from './tipDemos/parts';

// The small pictures on rows and choices. On an iPhone they are Apple's own
// symbols; the web preview (and the App Store pictures taken from it) draws
// look-alikes: icons.web.tsx.

export type IconName = 'essentials' | 'lock' | 'recharge' | 'advanced' | 'widget' | 'tips' | 'pro' | 'secondThought' | 'lockMessage' | 'sums' | 'history' | 'pass' | 'warn' | 'phone' | 'message' | 'map';

const SF: Record<IconName, SFSymbol> = {
  essentials: 'heart.fill',
  lock: 'lock.fill',
  recharge: 'sunrise.fill',
  advanced: 'slider.horizontal.3',
  widget: 'square.grid.2x2.fill',
  tips: 'lightbulb.fill',
  pro: 'star.fill',
  secondThought: 'hand.raised.fill',
  lockMessage: 'text.bubble.fill',
  sums: 'plus.forwardslash.minus',
  history: 'chart.bar.fill',
  pass: 'ticket.fill',
  warn: 'exclamationmark.triangle.fill',
  phone: 'phone.fill',
  message: 'message.fill',
  map: 'map.fill',
};

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <SymbolView
      name={{ ios: SF[name] }}
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={<View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: color }} />}
    />
  );
}
