import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { tap, tick } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { display, space, type, useTheme } from './theme';

// The rooms of a place as folders in a file drawer, seen from the front: one
// folder up close, the next few standing behind it, each a little smaller with
// its name a little fainter, and their tabs stepped across the way cut tabs are.
//
// Flipping through: drag down (any slant) and the front folder tips towards
// you and drops away while the next one comes forward; drag up and it comes
// back. Each folder that passes gives a tick under the finger, like the wheel
// of a date picker. A flick carries on through a few folders and settles on
// one. Tapping a folder, by its body or its tab, opens the room.
//
// How it is built: the drag is an ordinary scroll view, so the feel (the
// momentum, the settle, the edges) is the iPhone's own. The scroll view is
// turned upside down, as an inverted list is, so that dragging down counts
// up from the first folder; the folders sit on a stage that stays in view and
// is turned the right way up again. Every folder's place, size and tilt is
// worked out from how far the view has scrolled, on the native side.

export interface DeckRoom {
  id: string;
  name: string;
  icon: IconName;
  /** On the folder, on the left: "9 items", "Nothing here yet". */
  line: string;
  /** A room whose things have no value says so in amber. */
  lineTone: 'muted' | 'amber';
  /** On the right: what the room adds up to. Left out when nothing in it has a value. */
  value?: string;
}

const TAB_H = 30;
const BODY_H = 86;
const CARD_H = TAB_H + BODY_H;
/** How far the finger travels to pass one folder. */
export const DECK_STEP = 84;
/** Room under the front folder, for its shadow, and above the last tab. */
const FLOOR = 10;
const DOTS_H = 22;
/** Each folder further back is this much smaller. */
const SHRINK = 0.055;
const NATIVE = Platform.OS !== 'web';

/** How many folders stand behind the front one, and how far apart their tabs are, for the height there is. */
export function deckLayout(stageHeight: number): { behind: number; gap: number } {
  const spare = stageHeight - CARD_H - FLOOR - 8;
  const behind = Math.max(1, Math.min(4, Math.floor(spare / 36)));
  return { behind, gap: Math.max(24, Math.min(46, spare / behind)) };
}

function Folder({
  room,
  index,
  width,
  scrollY,
  behind,
  gap,
  onOpen,
}: {
  room: DeckRoom;
  index: number;
  width: number;
  scrollY: Animated.Value;
  behind: number;
  gap: number;
  onOpen: (id: string) => void;
}) {
  const { c } = useTheme();
  // Three tab positions, left to right, then round again.
  const offset = width * 0.21 * (index % 3);
  const tabMax = Math.max(width - offset - (offset > 0 ? 44 : 30), 90);

  // Depth 0 is the front. This folder is at depth d when the view has scrolled to (index - d) steps.
  // From the back: hidden behind the last one that shows, then one place forward per step, then off the front.
  const { style, ink, writing } = useMemo(() => {
    const at = index * DECK_STEP;
    const input: number[] = [];
    const scale: number[] = [];
    const shift: number[] = [];
    const opacity: number[] = [];
    const label: number[] = [];
    const body: number[] = [];
    const tilt: string[] = [];
    for (let d = behind + 1; d >= 0; d--) {
      const slot = Math.min(d, behind);
      const s = 1 - SHRINK * slot;
      input.push(at - d * DECK_STEP);
      scale.push(s);
      // The folder grows from its bottom edge, so lifting its top by one gap per place means lifting the bottom a little more.
      shift.push(-(slot * gap) - (1 - s) * CARD_H);
      // Folders are solid, so nothing shows through them. One further back than the last that shows is hidden behind it and faded out.
      opacity.push(d > behind ? 0 : 1);
      label.push(1 - (0.55 * slot) / behind);
      // Only the folder in front shows what is written on it. The band of each one behind that shows above the next
      // is deeper than its tab, and a count or a total cut off by the folder in front reads as a mistake.
      body.push(d === 0 ? 1 : 0);
      tilt.push('0deg');
    }
    // Past the front: tipped towards the reader, dropping and fading, gone by one step.
    for (const [d, drop, fade, lean] of [
      [0.5, 0.5, 0.3, '-34deg'],
      [1, 1.1, 0, '-58deg'],
    ] as const) {
      input.push(at + d * DECK_STEP);
      scale.push(1 + 0.05 * d);
      shift.push(CARD_H * drop);
      opacity.push(fade);
      label.push(1);
      body.push(1);
      tilt.push(lean);
    }
    const clamp = { extrapolate: 'clamp' as const };
    return {
      ink: scrollY.interpolate({ inputRange: input, outputRange: label, ...clamp }),
      writing: scrollY.interpolate({ inputRange: input, outputRange: body, ...clamp }),
      style: {
        opacity: scrollY.interpolate({ inputRange: input, outputRange: opacity, ...clamp }),
        transform: [
          { perspective: 900 },
          { translateY: scrollY.interpolate({ inputRange: input, outputRange: shift, ...clamp }) },
          { scale: scrollY.interpolate({ inputRange: input, outputRange: scale, ...clamp }) },
          { rotateX: scrollY.interpolate({ inputRange: input, outputRange: tilt, ...clamp }) },
        ],
      },
    };
  }, [index, behind, gap, scrollY]);

  const said = [room.name, room.line, room.value].filter(Boolean).join(', ');
  return (
    <Animated.View style={[styles.folder, style]}>
      <Pressable
        testID={`room-${room.name}`}
        // @ts-expect-error dataSet is a react-native-web prop: the browser run reads the folder's place in the drawer from it.
        dataSet={{ index }}
        accessibilityRole="button"
        accessibilityLabel={said}
        onPress={() => {
          tap();
          onOpen(room.id);
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <View style={[styles.tabRow, { marginLeft: offset }]}>
          {/* A tab away from the folder's left edge slopes on both sides; the first position keeps the folder's straight edge. */}
          {offset > 0 ? <View style={[styles.tabSlantLeft, { backgroundColor: c.manilaTab }]} /> : null}
          <View style={[styles.tab, offset > 0 ? styles.tabInset : null, { backgroundColor: c.manilaTab, maxWidth: tabMax }]}>
            <Animated.View style={[styles.tabInk, { opacity: ink }]}>
              <Icon name={room.icon} size={14} color={c.manilaInk2} />
              <Text testID={`room-tab-${room.name}`} style={[type.footnote, styles.tabText, { color: c.manilaInk }]} numberOfLines={1}>
                {room.name}
              </Text>
            </Animated.View>
          </View>
          <View testID={`room-slant-${room.name}`} style={[styles.tabSlant, { backgroundColor: c.manilaTab }]} />
        </View>
        <View style={[styles.body, { backgroundColor: c.manila, borderTopColor: c.manilaEdge }, offset === 0 ? { borderTopLeftRadius: 0 } : null]}>
          <Animated.View style={[styles.writing, { opacity: writing }]}>
            <Text style={[type.callout, { color: room.lineTone === 'amber' ? c.amber : c.manilaInk2, flexShrink: 1 }]} numberOfLines={1}>
              {room.line}
            </Text>
            <View style={styles.right}>
              {room.value ? (
                <Text style={[styles.value, type.tabular, { color: c.manilaInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {room.value}
                </Text>
              ) : null}
              <Icon name="chevron" size={14} color={c.manilaInk2} />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function RoomDeck({ rooms, onOpen, height }: { rooms: DeckRoom[]; onOpen: (id: string) => void; /** Everything: the folders and the row of dots under them. */ height: number }) {
  const { c } = useTheme();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState<number | null>(null);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const n = rooms.length;
  const stage = Math.max(height - DOTS_H, CARD_H + FLOOR + 40);
  const { behind, gap } = deckLayout(stage);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((was) => (was !== null && Math.abs(was - w) < 0.5 ? was : w));
  };

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: NATIVE }), [scrollY]);

  // A tick under the finger each time a folder passes, and the dot under the drawer moves along.
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const now = Math.max(0, Math.min(n - 1, Math.round(value / DECK_STEP)));
      if (now === frontRef.current) return;
      frontRef.current = now;
      tick();
      setFront(now);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, n]);

  if (n === 0) return null;
  const shown = Math.min(front, n - 1);
  return (
    <View style={[styles.deck, { height }]} onLayout={onLayout}>
      <Animated.ScrollView
        testID="room-deck"
        style={[{ height: stage }, styles.flip]}
        contentContainerStyle={{ height: stage + (n - 1) * DECK_STEP }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={DECK_STEP}
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Rooms. Swipe down to flip through them.">
        {/* The stage: it moves down the page exactly as fast as the page moves up, so it stays put, and is turned the right way up. */}
        <Animated.View style={{ height: stage, transform: [{ translateY: scrollY }, { scaleY: -1 }] }}>
          {width === null
            ? null
            : // The first folder is drawn last, so it is in front.
              rooms
                .map((room, i) => <Folder key={room.id} room={room} index={i} width={width} scrollY={scrollY} behind={behind} gap={gap} onOpen={onOpen} />)
                .reverse()}
        </Animated.View>
      </Animated.ScrollView>
      <View style={styles.dots} testID="room-deck-place" accessible accessibilityLabel={`${rooms[shown].name}, ${shown + 1} of ${n}`}>
        {n > 14 ? (
          <Text style={[type.caption, type.tabular, { color: c.ink2 }]}>
            {shown + 1} of {n}
          </Text>
        ) : n > 1 ? (
          rooms.map((room, i) => <View key={room.id} style={[styles.dot, { backgroundColor: i === shown ? c.green : c.rule }, i === shown ? styles.dotOn : null]} />)
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { marginHorizontal: space.xl, marginTop: space.m },
  flip: { transform: [{ scaleY: -1 }] },
  folder: { position: 'absolute', left: 0, right: 0, bottom: FLOOR, height: CARD_H, transformOrigin: 'bottom' },
  tabRow: { flexDirection: 'row', height: TAB_H, marginBottom: -1, zIndex: 1 },
  // The slanted edge overlaps the last 12 points of the tab, so the name stops well short of it.
  tab: { height: TAB_H, justifyContent: 'center', borderTopLeftRadius: 9, paddingLeft: space.m, paddingRight: space.xl },
  tabInk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabInset: { borderTopLeftRadius: 0, paddingLeft: space.l },
  tabText: { fontWeight: '600', flexShrink: 1 },
  tabSlantLeft: { width: 24, height: TAB_H, marginRight: -12, borderTopLeftRadius: 9, transform: [{ skewX: '-24deg' }] },
  tabSlant: { width: 24, height: TAB_H, marginLeft: -12, borderTopRightRadius: 9, transform: [{ skewX: '24deg' }] },
  body: { height: BODY_H, borderRadius: 16, borderTopWidth: 1, boxShadow: '0 -3px 10px rgba(0, 0, 0, 0.14)' },
  writing: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m, paddingHorizontal: space.l },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  value: { fontFamily: display.medium, fontSize: 27, lineHeight: 32, letterSpacing: -0.4, flexShrink: 1 },
  dots: { height: DOTS_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { width: 16 },
});
