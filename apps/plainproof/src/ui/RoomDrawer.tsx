import { useMemo, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { tap } from '@/platform/haptics';

import { Icon, type IconName } from './Icon';
import { display, space, type, useTheme } from './theme';

// The rooms of a home as folders standing in a file drawer: each one a manila
// folder with its name on the tab, tucked behind the next. The tabs step
// across in three positions, the way cut tabs do in a real drawer, so every
// name stays readable.
//
// Sifting: as the list scrolls, a folder that reaches the top of the screen
// stops there and the ones after it close up over it, so the folders already
// passed gather into a pile of tabs instead of leaving, each name still
// showing and still a tap away. When the last folder has joined the pile, the
// whole pile scrolls on. Pressing a folder lifts it out a little before it opens.

export interface DrawerRoom {
  id: string;
  name: string;
  icon: IconName;
  /** Under the tab, on the left: "9 items", "Nothing here yet". */
  line: string;
  /** A room whose things have no value says so in amber. */
  lineTone: 'muted' | 'amber';
  /** On the right: what the room adds up to. Left out when nothing in it has a value. */
  value?: string;
}

const TAB_H = 30;
const STRIP_H = 50;
/** From the top of one folder to the top of the next. */
export const FOLDER_STEP = TAB_H + STRIP_H;
/** How much of a folder's body is tucked behind the next folder. */
const TUCK = 16;
/** Folders in the pile at the top of the screen sit this close, as a share of the usual step: just their tabs. */
const PILE = 0.3;
/** How far a folder comes up while it is pressed. */
const LIFT = 9;
const NATIVE = Platform.OS !== 'web';

function Folder({
  room,
  index,
  count,
  width,
  shift,
  fade,
  onOpen,
}: {
  room: DrawerRoom;
  index: number;
  count: number;
  width: number;
  shift: Animated.AnimatedInterpolation<number> | null;
  /** What is written on the folder fades as the next one closes over it, so the pile shows names only, not cut-off lines. */
  fade: Animated.AnimatedInterpolation<number> | null;
  onOpen: (id: string) => void;
}) {
  const { c } = useTheme();
  const [lift] = useState(() => new Animated.Value(0));
  const last = index === count - 1;
  // Three tab positions, left to right, then round again.
  const offset = width * 0.21 * (index % 3);
  const tabMax = Math.max(width - offset - (offset > 0 ? 44 : 30), 90);
  const move = (to: number) => Animated.spring(lift, { toValue: to, useNativeDriver: NATIVE, speed: 28, bounciness: 6 }).start();
  const translateY = shift ? Animated.add(shift, lift) : lift;
  const said = [room.name, room.line, room.value].filter(Boolean).join(', ');
  return (
    <Animated.View style={[{ marginBottom: last ? 0 : -TUCK, transform: [{ translateY }] }]}>
      <Pressable
        testID={`room-${room.name}`}
        accessibilityRole="button"
        accessibilityLabel={said}
        onPressIn={() => move(-LIFT)}
        onPressOut={() => move(0)}
        onPress={() => {
          tap();
          onOpen(room.id);
        }}>
        <View style={[styles.tabRow, { marginLeft: offset }]}>
          {/* A tab away from the folder's left edge slopes on both sides; the first position keeps the folder's straight edge. */}
          {offset > 0 ? <View style={[styles.tabSlantLeft, { backgroundColor: c.manilaTab }]} /> : null}
          <View style={[styles.tab, offset > 0 ? styles.tabInset : null, { backgroundColor: c.manilaTab, maxWidth: tabMax }]}>
            <Icon name={room.icon} size={14} color={c.manilaInk2} />
            <Text testID={`room-tab-${room.name}`} style={[type.footnote, styles.tabText, { color: c.manilaInk }]} numberOfLines={1}>
              {room.name}
            </Text>
          </View>
          <View testID={`room-slant-${room.name}`} style={[styles.tabSlant, { backgroundColor: c.manilaTab }]} />
        </View>
        <View
          style={[
            styles.body,
            { height: STRIP_H + (last ? 6 : TUCK), backgroundColor: c.manila, borderTopColor: c.manilaEdge },
            offset === 0 ? { borderTopLeftRadius: 0 } : null,
          ]}>
          <Animated.View style={[styles.strip, fade ? { opacity: fade } : null]}>
            <Text style={[type.subhead, { color: room.lineTone === 'amber' ? c.amber : c.manilaInk2, flexShrink: 1 }]} numberOfLines={1}>
              {room.line}
            </Text>
            <View style={styles.right}>
              {room.value ? (
                <Text style={[styles.value, type.tabular, { color: c.manilaInk }]} numberOfLines={1}>
                  {room.value}
                </Text>
              ) : null}
              <Icon name="chevron" size={13} color={c.manilaInk2} />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function RoomDrawer({
  rooms,
  onOpen,
  scrollY,
  pileAt,
}: {
  rooms: DrawerRoom[];
  onOpen: (id: string) => void;
  /** How far the screen is scrolled. Without it the folders simply scroll. */
  scrollY?: Animated.Value;
  /** Where the pile forms, in points from the top of the screen. */
  pileAt: number;
}) {
  const [box, setBox] = useState<{ y: number; width: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { y, width } = e.nativeEvent.layout;
    setBox((b) => (b && Math.abs(b.y - y) < 0.5 && Math.abs(b.width - width) < 0.5 ? b : { y, width }));
  };
  const n = rooms.length;
  const top = box?.y ?? null;
  // One shift per folder. Folder i has a place in the pile, a little below the one before it. It scrolls as
  // usual until it reaches that place, then holds still (it moves down the page exactly as fast as the page
  // moves up) until every folder after it has closed up too. The last folder never holds, so the pile leaves with it.
  const moves = useMemo(() => {
    if (!scrollY || top === null) return rooms.map(() => ({ shift: null, fade: null }));
    const squeeze = FOLDER_STEP * (1 - PILE);
    return rooms.map((_, i) => {
      const hold = (n - 1 - i) * squeeze;
      if (hold <= 0) return { shift: null, fade: null };
      const start = top + i * squeeze - pileAt;
      return {
        shift: scrollY.interpolate({ inputRange: [start, start + hold], outputRange: [0, hold], extrapolate: 'clamp' }),
        // The next folder takes one squeeze of scrolling to close over this one; the writing is gone by halfway.
        fade: scrollY.interpolate({ inputRange: [start, start + squeeze * 0.5], outputRange: [1, 0], extrapolate: 'clamp' }),
      };
    });
  }, [rooms, n, scrollY, top, pileAt]);
  return (
    <View testID="room-drawer" style={styles.drawer} onLayout={onLayout}>
      {box
        ? rooms.map((room, i) => <Folder key={room.id} room={room} index={i} count={n} width={box.width} shift={moves[i].shift} fade={moves[i].fade} onOpen={onOpen} />)
        : // Until the width is known, hold the space the folders will take so nothing jumps.
          <View style={{ height: n * FOLDER_STEP }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { marginHorizontal: space.xl, marginTop: space.xl },
  tabRow: { flexDirection: 'row', height: TAB_H, marginBottom: -1, zIndex: 1 },
  // The slanted edge overlaps the last 12 points of the tab, so the name stops well short of it.
  tab: { height: TAB_H, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopLeftRadius: 9, paddingLeft: space.m, paddingRight: space.xl },
  tabInset: { borderTopLeftRadius: 0, paddingLeft: space.l },
  tabText: { fontWeight: '600', flexShrink: 1 },
  tabSlantLeft: { width: 24, height: TAB_H, marginRight: -12, borderTopLeftRadius: 9, transform: [{ skewX: '-24deg' }] },
  tabSlant: { width: 24, height: TAB_H, marginLeft: -12, borderTopRightRadius: 9, transform: [{ skewX: '24deg' }] },
  body: { borderRadius: 14, borderTopWidth: 1, boxShadow: '0 -2px 6px rgba(0, 0, 0, 0.10)' },
  strip: { height: STRIP_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m, paddingHorizontal: space.l },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  value: { fontFamily: display.medium, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
});
