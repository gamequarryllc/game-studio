import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { Icon } from './icons';
import { c } from './theme';

// Setup's example apps, drawn to look like the apps themselves: three that
// people keep open (Phone, Messages, Maps), two more for the list of
// essentials, and three that eat the day (Instagram, YouTube, TikTok). The
// owner, on the first drafts of the new setup (2026-11-27): "the fake app
// icons look bad maybe we use real insta or YouTube or TikTok icons?" Up to
// build 172 these were white symbols on coloured squares named "Videos",
// "Games" and "Social", which read as nobody's apps.
//
// They are small pictures in assets/images/apps, drawn from each app's own
// mark; they are examples in a picture, never buttons, and never stand for
// the person's own apps: those are drawn by iOS (AppIcons.tsx), which hands
// Plainlimit nothing about them.

export type BrandName = 'instagram' | 'youtube' | 'tiktok' | 'phone' | 'messages' | 'maps' | 'whatsapp' | 'music';

const PICTURES: Record<BrandName, ImageSourcePropType> = {
  instagram: require('../../assets/images/apps/instagram.png'),
  youtube: require('../../assets/images/apps/youtube.png'),
  tiktok: require('../../assets/images/apps/tiktok.png'),
  phone: require('../../assets/images/apps/phone.png'),
  messages: require('../../assets/images/apps/messages.png'),
  maps: require('../../assets/images/apps/maps.png'),
  whatsapp: require('../../assets/images/apps/whatsapp.png'),
  music: require('../../assets/images/apps/music.png'),
};

export const BRAND_NAMES: Record<BrandName, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  phone: 'Phone',
  messages: 'Messages',
  maps: 'Maps',
  whatsapp: 'WhatsApp',
  music: 'Music',
};

/** The green of the essentials: they never use up the battery. */
export const FREE = '#57E389';
/** A locked app. */
export const LOCKED = '#FF7B6B';

/**
 * One example app, `size` points square. `state`: 'locked' is an app the
 * empty battery has locked (dark, under a lock); 'dark' is the same with no
 * lock of its own; 'dim' is one that is not ticked. A picture only: whatever
 * holds it says what it shows.
 */
export function BrandApp({ name, size, state }: { name: BrandName; size: number; state?: 'locked' | 'dark' | 'dim' }) {
  return (
    <View style={{ width: size, height: size }}>
      <Image source={PICTURES[name]} style={{ width: size, height: size, opacity: state === 'locked' || state === 'dark' ? 0.24 : state === 'dim' ? 0.45 : 1 }} />
      {/* A faint edge, as the iPhone gives its own: the black ones would be lost on the dark ground. */}
      <View pointerEvents="none" style={[styles.edge, { borderRadius: size * 0.2237 }]} />
      {state === 'locked' ? (
        <View pointerEvents="none" style={styles.over}>
          <Icon name="lock" size={Math.round(size * 0.44)} color={LOCKED} />
        </View>
      ) : null}
    </View>
  );
}

/** The round green tick on a chosen app's corner; `ring` is the colour it sits on. */
export function Tick({ size = 22, color = FREE, ring = c.ground }: { size?: number; color?: string; ring?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: Math.max(2, Math.round(size * 0.11)), borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="check" size={Math.round(size * 0.5)} color={c.onTone} />
    </View>
  );
}

/** The empty ring on an app that is not ticked. */
function Ring({ size = 22 }: { size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(14,16,17,0.7)' }} />;
}

/** An example app with a tick on its corner (or, `ticked` false, an empty ring, and the app dimmed). */
export function TickedApp({ name, size, ticked = true, ring }: { name: BrandName; size: number; ticked?: boolean; ring?: string }) {
  const mark = Math.round(size * 0.4);
  return (
    <View style={{ width: size, height: size }}>
      <BrandApp name={name} size={size} state={ticked ? undefined : 'dim'} />
      <View pointerEvents="none" style={{ position: 'absolute', right: -Math.round(mark * 0.26), bottom: -Math.round(mark * 0.26) }}>
        {ticked ? <Tick size={mark} ring={ring} /> : <Ring size={mark} />}
      </View>
    </View>
  );
}

/** An example app as it sits on a home screen: its picture, a tick or a ring on the corner, and its name under it. */
export function HomeApp({ name, size, ticked }: { name: BrandName; size: number; ticked: boolean }) {
  return (
    <View style={{ width: size + 16, alignItems: 'center', gap: 7 }}>
      <TickedApp name={name} size={size} ticked={ticked} />
      <Text numberOfLines={1} style={[styles.name, ticked ? null : { color: c.ink3 }]}>
        {BRAND_NAMES[name]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  over: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 11.5, lineHeight: 14, fontWeight: '500', color: '#FFFFFF' },
});
