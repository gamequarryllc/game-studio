import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Animated, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { c } from '../theme';

// The pieces the tip demos are drawn with: a stage, a small phone, app tiles
// and a finger's touch. Everything is placed on a fixed 316 by 160 stage
// (the card's inside width on a 6.1-inch iPhone) and the stage is scaled to
// the card, so the drawings line up on every phone. The tiles are plain
// colours with a symbol: look-alikes, never a real company's icon.

/** An SF Symbol's name. */
export type SFSymbol = Extract<SymbolViewProps['name'], string>;

export const STAGE_W = 316;
export const STAGE_H = 160;

/** The phone's casing colour, used for every device drawn. */
export const CASE = '#2B2E33';
export const CASE_EDGE = '#3A3E44';

/** A box placed on the stage (or inside a phone's screen). */
export function at(left: number, top: number, width?: number, height?: number): ViewStyle {
  return { position: 'absolute', left, top, width, height };
}

/** The stage: a dark rounded box above the tip's words, hidden from screen readers (the words say it all). */
export function Stage({ children, bg = c.ground }: { children: ReactNode; bg?: string }) {
  const [width, setWidth] = useState(STAGE_W);
  const scale = width / STAGE_W;
  const height = Math.round(STAGE_H * scale);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={{ height, borderRadius: 16, backgroundColor: bg, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: STAGE_W, height: STAGE_H, left: (width - STAGE_W) / 2, top: (height - STAGE_H) / 2, transform: [{ scale }] }}>{children}</View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: '#1E2124' }} />
    </View>
  );
}

/** An SF Symbol, or a plain dot where there are none (the web preview). */
export function Glyph({ sf, size, color }: { sf: SFSymbol; size: number; color: string }) {
  return (
    <SymbolView
      name={{ ios: sf }}
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={<View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: color }} />}
    />
  );
}

export type AppKey =
  | 'phone'
  | 'messages'
  | 'maps'
  | 'camera'
  | 'calendar'
  | 'music'
  | 'videos'
  | 'videos2'
  | 'social'
  | 'social2'
  | 'games'
  | 'games2'
  | 'shop'
  | 'news'
  | 'mail'
  | 'book';

const APPS: Record<AppKey, { bg: string; fg: string; sf: SFSymbol }> = {
  phone: { bg: '#34C759', fg: '#FFFFFF', sf: 'phone.fill' },
  messages: { bg: '#34C759', fg: '#FFFFFF', sf: 'message.fill' },
  maps: { bg: '#DCEFE0', fg: '#F0483E', sf: 'mappin' },
  camera: { bg: '#BDC1C6', fg: '#2C2E31', sf: 'camera.fill' },
  calendar: { bg: '#FFFFFF', fg: '#F0483E', sf: 'calendar' },
  music: { bg: '#F7475F', fg: '#FFFFFF', sf: 'music.note' },
  videos: { bg: '#8A56F2', fg: '#FFFFFF', sf: 'play.fill' },
  videos2: { bg: '#E8403F', fg: '#FFFFFF', sf: 'play.fill' },
  social: { bg: '#3F8FF7', fg: '#FFFFFF', sf: 'heart.fill' },
  social2: { bg: '#F0609E', fg: '#FFFFFF', sf: 'camera.fill' },
  games: { bg: '#F6902E', fg: '#FFFFFF', sf: 'gamecontroller.fill' },
  games2: { bg: '#27C2B0', fg: '#FFFFFF', sf: 'gamecontroller.fill' },
  shop: { bg: '#F7C230', fg: '#FFFFFF', sf: 'cart.fill' },
  news: { bg: '#EE5A4E', fg: '#FFFFFF', sf: 'newspaper.fill' },
  mail: { bg: '#3F8FF7', fg: '#FFFFFF', sf: 'envelope.fill' },
  book: { bg: '#F59A2E', fg: '#FFFFFF', sf: 'book.fill' },
};

/** The same colour with its colour taken out, for the grayscale demo. */
export function gray(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const v = Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/** An app tile. `grayed` draws it without colour. */
export function Tile({ app, size, style, grayed = false }: { app: AppKey; size: number; style?: StyleProp<ViewStyle>; grayed?: boolean }) {
  const a = APPS[app];
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.235, backgroundColor: grayed ? gray(a.bg) : a.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Glyph sf={a.sf} size={size * 0.56} color={grayed ? gray(a.fg) : a.fg} />
    </View>
  );
}

/** A small phone: casing, screen and island. `children` are placed on the screen. */
export function Phone({ x, y, w, h, screen = '#050607', children }: { x: number; y: number; w: number; h: number; screen?: string; children?: ReactNode }) {
  const r = Math.round(w * 0.2);
  return (
    <View style={[at(x, y, w, h), { borderRadius: r, backgroundColor: CASE, borderWidth: 1, borderColor: CASE_EDGE }]}>
      <View style={{ position: 'absolute', left: 1.5, top: 1.5, right: 1.5, bottom: 1.5, borderRadius: r - 2.5, backgroundColor: screen, overflow: 'hidden' }}>{children}</View>
      <View style={{ position: 'absolute', left: (w - 2 - Math.round(w * 0.3)) / 2, top: 5, width: Math.round(w * 0.3), height: 6, borderRadius: 3, backgroundColor: '#000' }} />
    </View>
  );
}

/** A finger's touch, as screen recordings draw it, centred on x, y. */
export function Touch({ x, y, opacity, scale, size = 32 }: { x: number; y: number; opacity: Animated.AnimatedInterpolation<number>; scale?: Animated.AnimatedInterpolation<number>; size?: number }) {
  const inner = size * 0.6;
  return (
    <Animated.View style={[at(x - size / 2, y - size / 2, size, size), { opacity, transform: scale ? [{ scale }] : [] }]}>
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.35)' }} />
      <View style={{ position: 'absolute', left: (size - inner) / 2, top: (size - inner) / 2, width: inner, height: inner, borderRadius: inner / 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
    </Animated.View>
  );
}

/** A line of words on the stage. */
export function Words({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text allowFontScaling={false} numberOfLines={2} style={[{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: c.ink3, textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}
