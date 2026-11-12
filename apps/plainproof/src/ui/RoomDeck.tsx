import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { tap, tick } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { display, space, type, useTheme } from './theme';

// The rooms of a place as the folders in a file drawer, all of them in view at
// once: a column of tabs, stepped across the way cut tabs are, with one folder
// open. The open folder shows what is written on it (how many things, what
// they add up to); the others show their tab.
//
// Sliding through: put a finger anywhere on the drawer and slide down, and the
// opening travels down the column with the finger, folder by folder, with a
// tick under the finger for each one, like running a thumb along the tabs.
// Slide up and it travels back. Tapping a tab opens that folder; tapping the
// open folder goes into the room.
//
// How it is built: the slide is an ordinary scroll view, so the momentum and
// the settle on one folder are the iPhone's own. It is turned upside down, as
// an inverted list is, so that sliding down counts up from the first folder,
// and one folder is exactly one folder's height of sliding, so the opening
// keeps pace with the finger. The folders sit on a stage that stays in view;
// each one's place is worked out from how far the view has scrolled, on the
// native side. When there are more folders than fit, the column also moves up
// as the opening moves down, so the open folder is always on screen.

export interface DeckRoom {
  id: string;
  name: string;
  icon: IconName;
  /** How many things are in the room: shown small on the tab. */
  count: number;
  /** On the open folder, on the left: "9 items", "Nothing here yet". */
  line: string;
  /** A room whose things have no value says so in amber. */
  lineTone: 'muted' | 'amber';
  /** On the open folder, on the right: what the room adds up to. Left out when nothing in it has a value. */
  value?: string;
}

const TAB_H = 30;
/** How much more of itself the open folder shows than a closed one. */
const OPEN = 64;
/** A closed folder shows its tab and this much below it, give or take: the room there is decides. */
const STEP_MIN = 30;
const STEP_MAX = 46;
const HINT_H = 26;
const NATIVE = Platform.OS !== 'web';

/** A colour for each folder's symbol, as coloured labels are used in a real drawer. Light theme, dark theme. */
const LABELS: readonly (readonly [string, string])[] = [
  ['#1E5B48', '#74C7A7'],
  ['#B4691F', '#E3A85C'],
  ['#3F6384', '#8DB4D6'],
  ['#A44A32', '#E08D74'],
  ['#6E4A78', '#C19ACB'],
  ['#2B7A74', '#7CCBC4'],
  ['#5F6E2E', '#B7C77A'],
  ['#9A4763', '#E596AE'],
];

/**
 * How the column is laid out in the height there is. `step` is the distance from one folder's top to the next
 * (and how far a finger slides to pass one). `shift` is how far the whole column has to move, in all, when the
 * folders do not fit: zero when they do.
 */
export function stackLayout(room: number, n: number): { step: number; total: number; viewport: number; shift: number } {
  const count = Math.max(n, 1);
  const step = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor((room - OPEN - TAB_H) / count)));
  const total = count * step + OPEN + TAB_H;
  const viewport = Math.max(Math.min(room, total), TAB_H + OPEN + STEP_MIN);
  return { step, total, viewport, shift: Math.max(0, total - viewport) };
}

// The drawer shows how it works once, the first time it is on screen after the app starts, and says so in a line
// under it until it has been used.
let shown = false;
let used = false;

function Folder({
  room,
  index,
  count,
  width,
  step,
  shift,
  scrollY,
  onPress,
}: {
  room: DeckRoom;
  index: number;
  count: number;
  width: number;
  step: number;
  shift: number;
  scrollY: Animated.Value;
  onPress: (index: number) => void;
}) {
  const { c, dark } = useTheme();
  // Three tab positions, left to right, then round again.
  const offset = width * 0.2 * (index % 3);
  const tabMax = Math.max(width - offset - (offset > 0 ? 44 : 30), 90);
  const label = LABELS[index % LABELS.length][dark ? 1 : 0];

  const { place, writing, ink } = useMemo(() => {
    const at = index * step;
    // Every folder after the open one sits one opening lower. This folder is "after" until the view has scrolled
    // to the folder before it, and comes up to its own place over the next step.
    const slide = count > 1 ? shift / ((count - 1) * step) : 0;
    const y = (s: number) => index * step + OPEN * Math.max(0, Math.min(1, index - s / step)) - slide * s;
    const far = count * step;
    const stops = [at - step - far, at - step, at, at + far];
    const clamp = { extrapolate: 'clamp' as const };
    return {
      place: scrollY.interpolate({ inputRange: stops, outputRange: stops.map(y), ...clamp }),
      // What is written on a folder shows only while it is the open one.
      writing: scrollY.interpolate({ inputRange: [at - step * 0.55, at, at + step * 0.55], outputRange: [0, 1, 0], ...clamp }),
      ink: scrollY.interpolate({ inputRange: [at - step, at, at + step], outputRange: [0.72, 1, 0.72], ...clamp }),
    };
  }, [index, count, step, shift, scrollY]);

  const said = [room.name, room.line, room.value].filter(Boolean).join(', ');
  // The open folder shows its body down to the next folder's tab row; what is written sits in that band.
  const band = step + OPEN - TAB_H;
  return (
    <Animated.View style={[styles.folder, { transform: [{ translateY: place }] }]}>
      <Pressable
        testID={`room-${room.name}`}
        // @ts-expect-error dataSet is a react-native-web prop: the browser run reads the folder's place in the drawer from it.
        dataSet={{ index }}
        accessibilityRole="button"
        accessibilityLabel={said}
        onPress={() => onPress(index)}>
        <View style={[styles.tabRow, { marginLeft: offset }]}>
          {/* A tab away from the folder's left edge slopes on both sides; the first position keeps the folder's straight edge. */}
          {offset > 0 ? <View style={[styles.tabSlantLeft, { backgroundColor: c.manilaTab }]} /> : null}
          <View style={[styles.tab, offset > 0 ? styles.tabInset : null, { backgroundColor: c.manilaTab, maxWidth: tabMax }]}>
            <Animated.View style={[styles.tabInk, { opacity: ink }]}>
              <Icon name={room.icon} size={15} color={label} />
              <Text testID={`room-tab-${room.name}`} style={[type.footnote, styles.tabText, { color: c.manilaInk }]} numberOfLines={1}>
                {room.name}
              </Text>
              {room.count > 0 ? <Text style={[type.caption, type.tabular, { color: c.manilaInk2 }]}>{room.count}</Text> : null}
            </Animated.View>
          </View>
          <View testID={`room-slant-${room.name}`} style={[styles.tabSlant, { backgroundColor: c.manilaTab }]} />
        </View>
        <View style={[styles.body, { height: step + OPEN + 18, backgroundColor: c.manila, borderTopColor: c.manilaEdge }, offset === 0 ? { borderTopLeftRadius: 0 } : null]}>
          <Animated.View testID={`room-writing-${room.name}`} style={[styles.writing, { height: band, opacity: writing }]}>
            <Text style={[type.callout, { color: room.lineTone === 'amber' ? c.amber : c.manilaInk2, flexShrink: 1 }]} numberOfLines={1}>
              {room.line}
            </Text>
            <View style={styles.right}>
              {room.value ? (
                <Text style={[styles.value, type.tabular, { color: c.manilaInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {room.value}
                </Text>
              ) : null}
              <View style={[styles.go, { backgroundColor: c.button }]}>
                <Icon name="chevron" size={12} color={c.onButton} />
              </View>
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function RoomDeck({ rooms, onOpen, room }: { rooms: DeckRoom[]; onOpen: (id: string) => void; /** The height there is for the drawer and the line under it. */ room: number }) {
  const { c } = useTheme();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState<number | null>(null);
  const [front, setFront] = useState(0);
  const [hint, setHint] = useState(!used);
  const frontRef = useRef(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const n = rooms.length;
  const { step, viewport, shift } = stackLayout(room - HINT_H, n);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((was) => (was !== null && Math.abs(was - w) < 0.5 ? was : w));
  };

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: NATIVE }), [scrollY]);

  // A tick under the finger each time the opening reaches another folder.
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      if (value > step * 0.5 && !used) {
        used = true;
        setHint(false);
      }
      const now = Math.max(0, Math.min(n - 1, Math.round(value / step)));
      if (now === frontRef.current) return;
      frontRef.current = now;
      tick();
      setFront(now);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, n, step]);

  // Once, the first time the drawer is seen: the opening dips to the second folder and comes back, to show that it moves.
  const ready = width !== null;
  useEffect(() => {
    if (!NATIVE || shown || !ready || n < 2) return;
    shown = true;
    const down = setTimeout(() => scroller.current?.scrollTo({ y: step, animated: true }), 650);
    const back = setTimeout(() => {
      if (!used) scroller.current?.scrollTo({ y: 0, animated: true });
    }, 1500);
    return () => {
      clearTimeout(down);
      clearTimeout(back);
    };
  }, [ready, n, step]);

  if (n === 0) return null;
  // Tapping the open folder goes into its room. Tapping any other brings the opening to it.
  const press = (index: number) => {
    tap();
    if (index === frontRef.current) onOpen(rooms[index].id);
    else scroller.current?.scrollTo({ y: index * step, animated: true });
  };
  const open = rooms[Math.min(front, n - 1)];
  return (
    <View style={styles.deck} onLayout={onLayout}>
      <View style={[styles.window, { height: viewport }]}>
        <Animated.ScrollView
          ref={scroller}
          testID="room-deck"
          // @ts-expect-error dataSet is a react-native-web prop: the browser run reads how far one folder is from it.
          dataSet={{ step }}
          style={[{ height: viewport }, styles.flip]}
          contentContainerStyle={{ height: viewport + (n - 1) * step }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          snapToInterval={step}
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          accessibilityLabel={`Rooms. ${open.name} is open. Slide down to go through them.`}>
          {/* The stage: it moves down the page exactly as fast as the page moves up, so it stays put, and is turned the right way up. */}
          <Animated.View style={{ height: viewport, transform: [{ translateY: scrollY }, { scaleY: -1 }] }}>
            {width === null
              ? null
              : rooms.map((item, i) => (
                  <Folder key={item.id} room={item} index={i} count={n} width={width} step={step} shift={shift} scrollY={scrollY} onPress={press} />
                ))}
          </Animated.View>
        </Animated.ScrollView>
      </View>
      <View style={styles.hint}>
        {hint && n > 1 ? (
          <Text testID="room-deck-hint" style={[type.caption, { color: c.ink3 }]} numberOfLines={1}>
            Slide down through the folders. Tap one to open it.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { marginHorizontal: space.xl, marginTop: space.m },
  // The window on the drawer: the last folder is cut off at its foot, with the corners a folder has.
  window: { overflow: 'hidden', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  flip: { transform: [{ scaleY: -1 }] },
  folder: { position: 'absolute', left: 0, right: 0, top: 0 },
  tabRow: { flexDirection: 'row', height: TAB_H, marginBottom: -1, zIndex: 1 },
  // The slanted edge overlaps the last 12 points of the tab, so the name stops well short of it.
  tab: { height: TAB_H, justifyContent: 'center', borderTopLeftRadius: 9, paddingLeft: space.m, paddingRight: space.xl },
  tabInk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabInset: { borderTopLeftRadius: 0, paddingLeft: space.l },
  tabText: { fontWeight: '600', flexShrink: 1 },
  tabSlantLeft: { width: 24, height: TAB_H, marginRight: -12, borderTopLeftRadius: 9, transform: [{ skewX: '-24deg' }] },
  tabSlant: { width: 24, height: TAB_H, marginLeft: -12, borderTopRightRadius: 9, transform: [{ skewX: '24deg' }] },
  // Square at the foot: the next folder covers it, and a rounded foot would let the page show through beside the next folder's shoulders.
  body: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.12)' },
  writing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m, paddingHorizontal: space.l },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.m, flexShrink: 1 },
  value: { fontFamily: display.medium, fontSize: 27, lineHeight: 32, letterSpacing: -0.4, flexShrink: 1 },
  go: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hint: { height: HINT_H, alignItems: 'center', justifyContent: 'center' },
});
