import { Fragment, type JSX } from 'react';
import { Animated, Text, View } from 'react-native';

import { glowForCells, toneAt, toneForCells } from '@/domain/tone';

import { c, display } from '../theme';
import { track, turn, useLoop, type Stop } from './loop';
import { CASE, CASE_EDGE, Glyph, Phone, Stage, Tile, Touch, Words, at, gray, type AppKey } from './parts';

// A small looping demo on each tip of "Use your phone less" (the owner asked
// for a picture of each tip moving, 2026-11-21). Each one acts the tip out in
// six seconds and starts again; under Reduce Motion it stands still on the
// moment the tip is done. Positions are on the 316 by 160 stage (parts.tsx).
// The mock-ups they were drawn from are in the project's files,
// plainlimit/tips-demos-mockups.

const GLOW = glowForCells(6);
const TONE = toneForCells(6).bg;
const RED = toneAt(1).bg;
const CORAL = '#FF7B6B';

/** Shown from `a` to `b` percent of the loop, hidden the rest of the time. */
const shown = (a: number, b: number): Stop[] => [
  [[0, a - 1], 0],
  [[a, b], 1],
  [[b + 1, 100], 0],
];

// 1. Turn the screen gray: three clicks of the side button, the switch flips on, the colour drains away.
function Gray() {
  const t = useLoop(0.6);
  const px = 176;
  const py = 7;
  const pw = 76;
  const apps: AppKey[] = ['social', 'videos', 'games', 'music', 'shop', 'news', 'social2', 'videos2', 'games2', 'messages', 'phone', 'maps'];
  const grayOn = track(t, [[[0, 20], 0], [[28, 84], 1], [[92, 100], 0]]);
  const screen = (grayed: boolean) => (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: grayed ? gray('#5B4CD3') : '#5B4CD3' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70, backgroundColor: grayed ? gray('#C2569B') : '#C2569B', opacity: 0.7 }} />
      {apps.map((app, i) => (
        <Tile key={i} app={app} size={16} grayed={grayed} style={at(7 + (i % 3) * 22, 20 + Math.floor(i / 3) * 24)} />
      ))}
    </View>
  );
  const press = (p: number): Stop[] => [
    [p, 0],
    [p + 1, 1],
    [p + 2, 0],
  ];
  // The side button pressed three times, near the start of the loop.
  const clicks: Stop[] = [[[0, 3], 0], ...press(4), ...press(9), ...press(14), [[16, 100], 0]];
  return (
    <>
      <Phone x={px} y={py} w={pw} h={146}>
        {screen(false)}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: grayOn }}>{screen(true)}</Animated.View>
      </Phone>
      <Animated.View style={[at(px + pw - 1, py + 34, 3.5, 24), { borderRadius: 2, backgroundColor: CASE_EDGE, transform: [{ translateX: track(t, clicks.map(([p, v]): Stop => [p, -1.5 * v])) }] }]}>
        <Animated.View style={{ flex: 1, borderRadius: 2, backgroundColor: GLOW, opacity: track(t, clicks) }} />
      </Animated.View>
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[at(px + pw + 8, py + 34 + i * 9, 5, 5), { borderRadius: 3, backgroundColor: GLOW, opacity: track(t, [[[0, 4 + i * 5], 0], [[5 + i * 5, 26], 1], [[32, 100], 0]]) }]} />
      ))}
      <View style={[at(28, 44, 116), { alignItems: 'center', gap: 12 }]}>
        <View style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: '#3A3D42' }}>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: TONE, opacity: track(t, [[[0, 19], 0], [[23, 83], 1], [[87, 100], 0]]) }} />
          <Animated.View style={[at(2, 2, 27, 27), { borderRadius: 14, backgroundColor: '#FFFFFF', transform: [{ translateX: track(t, [[[0, 19], 0], [[23, 83], 20], [[87, 100], 0]]) }] }]} />
        </View>
        <Words style={{ fontSize: 14, lineHeight: 18, color: c.ink2 }}>Grayscale</Words>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {['#E8443A', '#F5B21E', '#2FBF4F', '#2F7BEF'].map((col) => (
            <View key={col} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col }}>
              <Animated.View style={{ flex: 1, borderRadius: 6, backgroundColor: gray(col), opacity: grayOn }} />
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

// 2. Move time wasters to your computer: the fun apps hop from the phone onto a laptop.
function Computer() {
  const t = useLoop(0.7);
  const px = 28;
  const py = 7;
  const ox = px + 2.5;
  const oy = py + 2.5;
  const cols = [13, 38];
  const movers: AppKey[] = ['social', 'videos', 'games', 'shop'];
  return (
    <>
      <Phone x={px} y={py} w={76} h={146}>
        <Tile app="phone" size={22} style={at(cols[0], 82)} />
        <Tile app="maps" size={22} style={at(cols[1], 82)} />
        <Tile app="messages" size={22} style={at(cols[0], 112)} />
        <Tile app="camera" size={22} style={at(cols[1], 112)} />
      </Phone>
      <View style={[at(170, 18, 128, 84), { borderRadius: 9, backgroundColor: CASE, borderWidth: 1, borderColor: CASE_EDGE }]}>
        <View style={{ position: 'absolute', left: 3, top: 3, right: 3, bottom: 3, borderRadius: 5, backgroundColor: '#0A0B0C' }} />
      </View>
      <View style={[at(158, 102, 152, 7), { borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, backgroundColor: CASE_EDGE }]} />
      <View style={[at(218, 102, 32, 3), { borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#24272B' }]} />
      <View style={at(170, 124, 128)}>
        <Words>Sit down for it</Words>
      </View>
      {movers.map((app, i) => {
        const sx = ox + cols[i % 2];
        const sy = oy + 22 + Math.floor(i / 2) * 30;
        const dx = 182 + i * 26 - sx;
        const dy = 50 - sy;
        const s = 10 + i * 9;
        const mx = dx / 2;
        const my = Math.min(dy, 0) / 2 - 34;
        return (
          <Animated.View
            key={app}
            style={[
              at(sx, sy, 22, 22),
              {
                opacity: track(t, [[[0, 82], 1], [86, 0], [87, 0], [[94, 100], 1]]),
                transform: [
                  { translateX: track(t, [[[0, s], 0], [s + 5, mx], [[s + 10, 86], dx], [87, 0]]) },
                  { translateY: track(t, [[[0, s], 0], [s + 5, my], [[s + 10, 86], dy], [87, 0]]) },
                  { scale: track(t, [[[0, s], 1], [s + 5, 1.15], [[s + 10, 82], 1], [86, 0.6], [87, 0.6], [[94, 100], 1]]) },
                ],
              },
            ]}>
            <Tile app={app} size={22} />
          </Animated.View>
        );
      })}
    </>
  );
}

// 3. Keep only tools on the first home screen: the rest drift into the App Library.
function HomeScreen() {
  const t = useLoop(0.7);
  const px = 62;
  const py = 4;
  const ox = px + 2.5;
  const oy = py + 2.5;
  const size = 14;
  const gx = (col: number) => 6 + col * 17.5;
  const gy = (row: number) => 20 + row * 19;
  const others: AppKey[] = ['social', 'videos', 'games', 'music', 'shop', 'news', 'social2', 'videos2', 'games2', 'mail', 'book', 'social', 'games', 'videos2', 'shop'];
  const lib = { x: 228, y: 56 };
  const cells = Array.from({ length: 15 }, (_, n) => ({ col: (n + 1) % 4, row: Math.floor((n + 1) / 4), app: others[n] }));
  return (
    <>
      <Phone x={px} y={py} w={82} h={152} screen="#22304F">
        <Tile app="calendar" size={size} style={at(gx(0), gy(0))} />
        <View style={[at(4, 118, 71, 24), { borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.16)' }]} />
        {(['phone', 'messages', 'maps', 'camera'] as const).map((app, i) => (
          <Tile key={app} app={app} size={size} style={at(gx(i), 123)} />
        ))}
      </Phone>
      {cells.map(({ col, row, app }, n) => {
        const dx = lib.x - (ox + gx(col) + size / 2);
        const dy = lib.y - (oy + gy(row) + size / 2);
        const s = 14 + n * 1.6;
        return (
          <Animated.View
            key={n}
            style={[
              at(ox + gx(col), oy + gy(row), size, size),
              {
                opacity: track(t, [[[0, s], 1], [s + 12, 0], [[s + 12.5, 86], 0], [[94, 100], 1]]),
                transform: [
                  { translateX: track(t, [[[0, s], 0], [s + 12, dx], [s + 12.5, 0]]) },
                  { translateY: track(t, [[[0, s], 0], [s + 12, dy], [s + 12.5, 0]]) },
                  { scale: track(t, [[[0, s], 1], [s + 12, 0.5], [[s + 12.5, 86], 0.4], [[94, 100], 1]]) },
                ],
              },
            ]}>
            <Tile app={app} size={size} />
          </Animated.View>
        );
      })}
      <Animated.View style={[at(lib.x - 30, lib.y - 30, 60, 60), { borderRadius: 16, backgroundColor: c.raised, transform: [{ scale: track(t, [[[0, 30], 1], [36, 1.08], [[44, 100], 1]]) }] }]}>
        {(['social', 'videos', 'games', 'shop'] as const).map((app, i) => (
          <Tile key={app} app={app} size={19} style={at(9 + (i % 2) * 23, 9 + Math.floor(i / 2) * 23)} />
        ))}
      </Animated.View>
      <View style={at(lib.x - 50, lib.y + 38, 100)}>
        <Words>App Library</Words>
      </View>
      <Animated.View style={[at(160, lib.y - 9, 18, 18), { opacity: track(t, [[[0, 12], 0], [20, 1], [[42, 100], 0]]), transform: [{ translateX: track(t, [[[0, 12], 0], [20, 4], [[42, 100], 10]]) }] }]}>
        <Glyph sf="chevron.right" size={18} color={c.ink3} />
      </Animated.View>
    </>
  );
}

// 4. Only people get notifications: banners drop in, the app ones fall away, the people stay.
function Notifications() {
  const t = useLoop(0.7);
  const banners: { app: AppKey; who: string; what: string; person: boolean }[] = [
    { app: 'shop', who: 'Shop', what: 'Sale ends tonight!', person: false },
    { app: 'messages', who: 'Sam', what: 'On my way', person: true },
    { app: 'social', who: 'Social', what: '9 new likes', person: false },
    { app: 'phone', who: 'Mom', what: 'Missed call', person: true },
  ];
  return (
    <>
      <View style={[at(150, 6, 16, 16), { alignItems: 'center' }]}>
        <Glyph sf="lock.fill" size={14} color={c.ink3} />
      </View>
      {banners.map((b, i) => {
        const s = i * 7;
        const up = i === 1 ? -33 : -66;
        const motion = b.person
          ? {
              opacity: track(t, [[[0, s], 0], [[s + 5, 86], 1], [[94, 100], 0]]),
              transform: [{ translateY: track(t, [[[0, s], -10], [[s + 5, 46], 0], [[56, 100], up]]) }],
            }
          : {
              opacity: track(t, [[[0, s], 0], [[s + 5, 40], 1], [[50, 100], 0]]),
              transform: [
                { translateY: track(t, [[[0, s], -10], [[s + 5, 100], 0]]) },
                { translateX: track(t, [[[0, 40], 0], [50, -40], [51, 0]]) },
                { scale: track(t, [[[0, 40], 1], [50, 0.92], [51, 1]]) },
              ],
            };
        return (
          <Animated.View key={b.who} style={[at(28, 30 + i * 33, 260, 30), { borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.10)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9 }, motion]}>
            <Tile app={b.app} size={20} />
            <Text allowFontScaling={false} style={{ fontSize: 13, fontWeight: '700', color: c.ink }}>
              {b.who}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.ink2 }}>
              {b.what}
            </Text>
            <Text allowFontScaling={false} style={{ fontSize: 11, color: c.ink3 }}>
              now
            </Text>
            {b.person ? (
              <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 11, borderWidth: 1.5, borderColor: GLOW, opacity: track(t, [[[0, 46], 0], [[56, 100], 1]]) }} />
            ) : null}
          </Animated.View>
        );
      })}
    </>
  );
}

/** A soft glow: rings of the same see-through colour, largest first. */
function Glow({ x, y, r, color, opacity }: { x: number; y: number; r: number; color: string; opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={[at(x - r, y - r, r * 2, r * 2), { opacity }]}>
      {[1, 0.84, 0.68, 0.52, 0.36].map((k) => (
        <View key={k} style={{ position: 'absolute', left: r * (1 - k), top: r * (1 - k), width: r * 2 * k, height: r * 2 * k, borderRadius: r * k, backgroundColor: color }} />
      ))}
    </Animated.View>
  );
}

/** A phone standing on a table, its screen lit by `lit`. */
function SmallPhone({ lit, light }: { lit: Animated.AnimatedInterpolation<number>; light: string }) {
  return (
    <View style={{ width: 13, height: 22, borderRadius: 3.5, backgroundColor: CASE, borderWidth: 1, borderColor: '#4A505A' }}>
      <View style={{ position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: 2, backgroundColor: '#1A2030' }} />
      <Animated.View style={{ position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: 2, backgroundColor: light, opacity: lit }} />
    </View>
  );
}

// 5. Charge it outside the bedroom: the glowing phone leaves the room, an alarm clock takes its place.
function Bedroom() {
  const t = useLoop(0.7);
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 0) => <View style={[at(x, y, w, h), { backgroundColor: color, borderRadius: radius }]} />;
  return (
    <>
      {box(0, 0, 316, 160, '#11151E')}
      <View style={[at(26, 16, 46, 40), { borderRadius: 4, backgroundColor: '#0A0E18', borderWidth: 3, borderColor: '#2A303B' }]} />
      <View style={at(45, 25)}>
        <Glyph sf="moon.fill" size={17} color="#E9E2B8" />
      </View>
      {box(0, 146, 246, 14, '#151A22')}
      <Glow x={206} y={86} r={46} color="rgba(140,170,255,0.05)" opacity={track(t, [[[0, 18], 1], [[30, 92], 0], [[98, 100], 1]])} />
      {box(18, 72, 10, 74, '#3A4252', 4)}
      {box(22, 112, 150, 22, '#2C3442', 5)}
      {box(30, 98, 34, 14, '#8C94A3', 7)}
      <View style={[at(62, 100, 112, 20), { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: '#3E5480' }]} />
      {box(24, 134, 6, 12, '#2C3442')}
      {box(164, 134, 6, 12, '#2C3442')}
      <Animated.View style={[at(56, 66, 24, 24), { opacity: track(t, [[[0, 60], 0], [68, 1], [[84, 100], 0]]), transform: [{ translateY: track(t, [[[0, 60], 6], [68, 0], [[84, 100], -8]]) }] }]}>
        <Text allowFontScaling={false} style={{ position: 'absolute', left: 2, top: 8, fontSize: 13, fontWeight: '700', color: '#8C94A3' }}>
          z
        </Text>
        <Text allowFontScaling={false} style={{ position: 'absolute', left: 11, top: 1, fontSize: 9, fontWeight: '700', color: '#8C94A3' }}>
          z
        </Text>
      </Animated.View>
      {box(184, 110, 46, 36, '#2A303B', 4)}
      {box(190, 124, 34, 2, '#3A4252', 1)}
      {box(246, 0, 4, 160, '#222833')}
      {box(250, 0, 66, 160, '#1A1F28')}
      <View style={[at(258, 34, 50, 112), { borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#151A22', borderWidth: 3, borderBottomWidth: 0, borderColor: '#2E3542' }]} />
      {box(270, 104, 28, 4, '#3A4252', 2)}
      {box(282, 108, 4, 38, '#2E3542')}
      <Animated.View style={[at(289, 82, 14, 14), { opacity: track(t, [[[0, 46], 0], [[50, 86], 1], [[90, 100], 0]]) }]}>
        <Glyph sf="bolt.fill" size={14} color={GLOW} />
      </Animated.View>
      <Animated.View
        style={[at(192, 90, 30, 20), { borderRadius: 6, backgroundColor: '#0B0D10', borderWidth: 2, borderColor: '#3A4252', alignItems: 'center', justifyContent: 'center', transform: [{ scale: track(t, [[[0, 50], 0], [56, 1.2], [[60, 86], 1], [[90, 100], 0]]) }] }]}>
        <Text allowFontScaling={false} style={{ fontSize: 9.5, fontWeight: '700', color: GLOW }}>
          7:00
        </Text>
      </Animated.View>
      <Animated.View
        style={[
          at(200, 88),
          {
            opacity: track(t, [[[0, 86], 1], [90, 0], [91, 0], [[97, 100], 1]]),
            transform: [
              { translateX: track(t, [[[0, 16], 0], [24, 10], [36, 52], [[44, 90], 76], [91, 0]]) },
              { translateY: track(t, [[[0, 16], 0], [24, -14], [36, -14], [[44, 90], -6], [91, 0]]) },
              { scale: track(t, [[[0, 36], 1], [[44, 90], 0.9], [91, 1]]) },
            ],
          },
        ]}>
        <SmallPhone light="#AFC3FF" lit={track(t, [[[0, 3], 1], [6, 0.3], [9, 1], [12, 0.3], [[15, 40], 1], [[48, 92], 0], [[98, 100], 1]])} />
      </Animated.View>
    </>
  );
}

// 6. Put it in another room when you work or eat: the buzzing phone goes next door, and the work moves on.
function OtherRoom() {
  const t = useLoop(0.7);
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 0) => <View style={[at(x, y, w, h), { backgroundColor: color, borderRadius: radius }]} />;
  const buzz: Stop[] = [
    [0, 0],
    [2, -9],
    [4, 9],
    [6, -9],
    [8, 9],
    [10, 0],
    [14, -9],
    [16, 9],
    [18, -9],
    [[20, 100], 0],
  ];
  return (
    <>
      {box(0, 0, 316, 160, '#16140F')}
      {box(0, 146, 238, 14, '#1C1A16')}
      {box(150, 0, 2, 22, '#3A3630')}
      <View style={[at(137, 22, 28, 14), { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#E9C77B' }]} />
      <Glow x={151} y={70} r={56} color="rgba(233,199,123,0.035)" opacity={track(t, [[[0, 100], 1]])} />
      {box(16, 112, 212, 7, '#5A4A36', 3)}
      {box(26, 119, 6, 27, '#4A3D2D')}
      {box(212, 119, 6, 27, '#4A3D2D')}
      <View style={[at(34, 60, 78, 50), { borderRadius: 5, backgroundColor: CASE, borderWidth: 1, borderColor: CASE_EDGE }]}>
        <View style={{ position: 'absolute', left: 3, top: 3, right: 3, bottom: 3, borderRadius: 2, backgroundColor: c.ground, padding: 7 }}>
          <View style={{ height: 4, width: 44, borderRadius: 2, backgroundColor: c.outline }} />
          <View style={{ height: 4, width: 56, borderRadius: 2, backgroundColor: CASE_EDGE, marginTop: 5 }} />
          <View style={{ height: 6, width: 56, borderRadius: 3, backgroundColor: '#24272B', marginTop: 9, overflow: 'hidden' }}>
            <Animated.View style={{ height: 6, width: 56, backgroundColor: GLOW, transformOrigin: 'left', transform: [{ scaleX: track(t, [[[0, 44], 0.15], [[84, 90], 1], [[96, 100], 0.15]]) }] }} />
          </View>
        </View>
      </View>
      <View style={[at(28, 109, 90, 4), { borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: CASE_EDGE }]} />
      {box(150, 106, 52, 7, '#D9D6CE', 26)}
      <View style={[at(160, 102, 32, 6), { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: '#C0703A' }]} />
      {box(238, 0, 4, 160, '#2A2620')}
      {box(242, 0, 74, 160, '#0F0E0C')}
      {box(256, 100, 44, 5, '#3A3630', 2)}
      <Animated.View style={[at(116, 84, 26, 16), { opacity: track(t, [[0, 0], [2, 1], [9, 1], [11, 0], [14, 1], [19, 1], [[21, 100], 0]]) }]}>
        <View style={[at(-3, 0, 6, 16), { borderLeftWidth: 2, borderColor: c.ink3, borderRadius: 8 }]} />
        <View style={[at(23, 0, 6, 16), { borderRightWidth: 2, borderColor: c.ink3, borderRadius: 8 }]} />
      </Animated.View>
      <Animated.View
        style={[
          at(122, 88),
          {
            opacity: track(t, [[[0, 87], 1], [90, 0], [91, 0], [[96, 100], 1]]),
            transform: [
              { translateX: track(t, [[[0, 20], 0], [26, 10], [38, 110], [[44, 90], 150], [91, 0]]) },
              { translateY: track(t, [[[0, 20], 0], [26, -22], [38, -22], [[44, 90], -10], [91, 0]]) },
              { rotate: turn(t, buzz) },
            ],
          },
        ]}>
        <SmallPhone light="#DDE6F0" lit={track(t, [[[0, 40], 1], [[46, 92], 0], [[97, 100], 1]])} />
      </Animated.View>
    </>
  );
}

// 7. Lower the goal one step at a time: a week under the line, then one tap of minus.
function LowerGoal() {
  const t = useLoop(0.7);
  const heights = [44, 52, 38, 50, 42, 54, 46];
  const bottom = 132;
  const barW = 20;
  const gap = 12;
  const x0 = (316 - (7 * barW + 6 * gap)) / 2;
  const lineY = bottom - 70;
  const drop = 10;
  const round = (x: number, sign: string, pressed?: Animated.AnimatedInterpolation<number>) => (
    <View style={[at(x, 4, 34, 34), { borderRadius: 17, borderWidth: 1.5, borderColor: c.outline, alignItems: 'center', justifyContent: 'center' }]}>
      {pressed ? <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 17, backgroundColor: '#2A2D31', opacity: pressed }} /> : null}
      <Text allowFontScaling={false} style={{ fontSize: 24, lineHeight: 28, fontWeight: '300', color: c.ink }}>
        {sign}
      </Text>
    </View>
  );
  const goal = (words: string, opacity: Animated.AnimatedInterpolation<number>) => (
    <Animated.Text allowFontScaling={false} style={[at(104, 6, 108), { textAlign: 'center', fontFamily: display.bold, fontSize: 25, lineHeight: 30, letterSpacing: -0.5, color: c.ink, opacity }]}>
      {words}
    </Animated.Text>
  );
  const dashes = (color: string) => (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: 23 }, (_, i) => (
        <View key={i} style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
  return (
    <>
      {round(70, '−', track(t, [[[0, 47], 0], [[49, 52], 1], [[56, 100], 0]]))}
      {round(212, '+')}
      {goal('2h 00m', track(t, [[[0, 50], 1], [[54, 88], 0], [[93, 100], 1]]))}
      {goal('1h 45m', track(t, [[[0, 50], 0], [[54, 88], 1], [[93, 100], 0]]))}
      <Touch x={87} y={21} opacity={track(t, [[[0, 44], 0], [[47, 52], 1], [[57, 100], 0]])} scale={track(t, [[[0, 44], 1.3], [[47, 100], 1]])} />
      {heights.map((h, i) => (
        <Animated.View
          key={i}
          style={[at(x0 + i * (barW + gap), bottom - h, barW, h), { borderRadius: 5, backgroundColor: TONE, transformOrigin: 'bottom', transform: [{ scaleY: track(t, [[[0, 3 + i * 5], 0], [[8 + i * 5, 86], 1], [[92, 100], 0]]) }] }]}
        />
      ))}
      {'MTWTFSS'.split('').map((d, i) => (
        <Text key={i} allowFontScaling={false} style={[at(x0 + i * (barW + gap), bottom + 6, barW), { textAlign: 'center', fontSize: 11, fontWeight: '600', color: c.ink3 }]}>
          {d}
        </Text>
      ))}
      <Animated.View style={[at(x0 - 10, lineY - 1, 316 - 2 * (x0 - 10), 2), { transform: [{ translateY: track(t, [[[0, 52], 0], [[58, 86], drop], [[94, 100], 0]]) }] }]}>
        {dashes('rgba(244,245,242,0.55)')}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: track(t, [[[0, 52], 0], [[58, 86], 1], [[94, 100], 0]]) }}>{dashes(GLOW)}</Animated.View>
      </Animated.View>
    </>
  );
}

// 8. Choose Work for it or Locked: what each choice does when the battery is empty.
function EmptyChoice() {
  const t = useLoop(0.58);
  const rows = [
    { title: 'Warn', line: 'One tap gets past', from: 1, to: 31 },
    { title: 'Work for it', line: 'Solve sums first', from: 34, to: 64 },
    { title: 'Locked', line: 'Closed till recharge', from: 67, to: 98 },
  ];
  const iw = 73;
  const ih = 143;
  const fill = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;
  const white = (size: number, weight: '600' | '700' = '700', font?: string) => ({ fontSize: size, fontWeight: weight, color: '#FFFFFF', textAlign: 'center' as const, fontFamily: font });
  return (
    <>
      {rows.map((r, i) => (
        <View key={r.title} style={[at(12, 10 + i * 48, 158, 42), { borderRadius: 12, backgroundColor: c.ground, borderWidth: 1.5, borderColor: c.rule, paddingVertical: 4, paddingHorizontal: 9 }]}>
          <Animated.View style={{ position: 'absolute', left: -1.5, top: -1.5, right: -1.5, bottom: -1.5, borderRadius: 12, borderWidth: 1.5, borderColor: GLOW, opacity: track(t, shown(r.from, r.to)) }} />
          <Text allowFontScaling={false} style={{ fontSize: 13.5, lineHeight: 17, fontWeight: '700', color: c.ink }}>
            {r.title}
          </Text>
          <Text allowFontScaling={false} style={{ fontSize: 11.5, lineHeight: 15, color: c.ink3 }}>
            {r.line}
          </Text>
          <Animated.View style={[at(130, 11, 16, 16), { opacity: track(t, shown(r.from, r.to)) }]}>
            <Glyph sf="checkmark" size={15} color={GLOW} />
          </Animated.View>
        </View>
      ))}
      <Phone x={206} y={6} w={78} h={148} screen={RED}>
        <Animated.View style={[fill, { opacity: track(t, [[[0, 32], 1], [[34, 98], 0], [100, 1]]) }]}>
          <Text allowFontScaling={false} style={[at(0, 32, iw), white(12, '700', display.bold)]}>
            Empty
          </Text>
          <View style={[at(12, 56, 44, 20), { borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF' }]} />
          <View style={[at(57, 62, 3, 8), { borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: '#FFFFFF' }]} />
          <View style={[at(7, ih - 36, iw - 14, 24), { borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }]}>
            <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 9.5, fontWeight: '600', color: c.onPaper }}>
              Keep going
            </Text>
          </View>
          <Touch x={iw / 2} y={ih - 24} size={26} opacity={track(t, [[[0, 11], 0], [[13, 16], 1], [[18, 100], 0]])} scale={track(t, [[[0, 11], 1.3], [[13, 100], 1]])} />
        </Animated.View>
        <Animated.View style={[fill, { backgroundColor: '#0A0B0C', opacity: track(t, [[[0, 16], 0], [[18, 31], 1], [[33, 100], 0]]) }]}>
          {['#2F7BEF', '#E8508F', '#F27A1A', '#7442E6'].map((col, i) => (
            <View key={col} style={[at(8, 18 + i * 32, iw - 16, 26), { borderRadius: 6, backgroundColor: col }]} />
          ))}
        </Animated.View>
        <Animated.View style={[fill, { opacity: track(t, shown(34, 64)) }]}>
          <Text allowFontScaling={false} style={[at(0, 34, iw), white(17, '700', display.bold)]}>
            47 + 38
          </Text>
          {['8', '5'].map((digit, i) => (
            <View key={digit} style={[at(14 + i * 26, 66, 20, 26), { borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }]}>
              <Animated.Text allowFontScaling={false} style={[white(15, '700', display.bold), { opacity: track(t, shown(42 + i * 6, 64)) }]}>
                {digit}
              </Animated.Text>
            </View>
          ))}
          <Animated.View style={[at(0, 102, iw), { alignItems: 'center', gap: 2, opacity: track(t, [[[0, 51], 0], [[54, 64], 1], [[65, 100], 0]]), transform: [{ scale: track(t, [[[0, 51], 0.6], [[54, 100], 1]]) }] }]}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Glyph sf="checkmark" size={13} color={RED} />
            </View>
            <Text allowFontScaling={false} style={white(11)}>
              +15 min
            </Text>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[fill, { opacity: track(t, shown(67, 98)) }]}>
          <Animated.View style={[at(0, 44, iw), { alignItems: 'center', transform: [{ scale: track(t, [[[0, 70], 1], [74, 1.15], [[78, 100], 1]]) }] }]}>
            <Glyph sf="lock.fill" size={32} color="#FFFFFF" />
          </Animated.View>
          <Text allowFontScaling={false} style={[at(0, 88, iw), white(10.5, '600'), { lineHeight: 14 }]}>
            {'Back at\n6:00 AM'}
          </Text>
        </Animated.View>
      </Phone>
    </>
  );
}

// 9. Know what you'll do instead: a spare moment, and the phone turns into a book, a walk, a call.
function Instead() {
  const t = useLoop(0.6);
  const faces: { bg: string; sf: 'iphone' | 'book.fill' | 'figure.walk' | 'phone.fill'; fg: string; word: string }[] = [
    { bg: '#3A3E44', sf: 'iphone', fg: '#8E949B', word: 'Scroll?' },
    { bg: '#F59A2E', sf: 'book.fill', fg: '#FFFFFF', word: 'Read' },
    { bg: TONE, sf: 'figure.walk', fg: c.onTone, word: 'Walk' },
    { bg: '#3F8FF7', sf: 'phone.fill', fg: '#FFFFFF', word: 'Call a friend' },
  ];
  const x = 178;
  const y = 18;
  const size = 96;
  return (
    <>
      <Animated.View style={[at(46, 34, 54, 54), { transform: [{ rotate: turn(t, [[[0, 40], 0], [[50, 90], 180], [100, 360]]) }] }]}>
        <Glyph sf="hourglass" size={54} color={c.ink3} />
      </Animated.View>
      <View style={at(16, 102, 114)}>
        <Words>A spare moment</Words>
      </View>
      <View style={at(142, 57)}>
        <Glyph sf="chevron.right" size={20} color={c.outline} />
      </View>
      {faces.map((f, i) => {
        const a = i * 25;
        const b = a + 25;
        const spin: Stop[] = i === 0 ? [[[0, 18], 0], [24, -90], [24.1, 90], [97, 90], [100, 0]] : [[[0, a], 90], [[a + 4, b - 6], 0], [b - 0.1, -90]];
        const seen: Stop[] = i === 0 ? [[[0, 24], 1], [24.1, 0], [97, 0], [[97.1, 100], 1]] : [[[0, a], 0], [[a + 0.1, b - 0.1], 1], [[b, 100], 0]];
        const word: Stop[] = i === 0 ? [[[0, 19], 1], [[23, 97], 0], [100, 1]] : [[[0, a + 1], 0], [[a + 4, b - 5], 1], [[b - 1, 100], 0]];
        return (
          <Fragment key={f.word}>
            <Animated.View
              style={[at(x, y, size, size), { borderRadius: 24, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden', opacity: track(t, seen), transform: [{ perspective: 500 }, { rotateY: turn(t, spin) }] }]}>
              <Glyph sf={f.sf} size={50} color={f.fg} />
              {i === 0 ? <View style={[at(14, 46, 68, 4), { borderRadius: 2, backgroundColor: CORAL, transform: [{ rotate: '-35deg' }] }]} /> : null}
            </Animated.View>
            <Animated.Text allowFontScaling={false} style={[at(x - 30, y + size + 10, size + 60), { textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '700', color: i === 0 ? c.ink3 : c.ink, opacity: track(t, word) }]}>
              {f.word}
            </Animated.Text>
          </Fragment>
        );
      })}
    </>
  );
}

export type TipDemoName = 'gray' | 'computer' | 'homeScreen' | 'notifications' | 'bedroom' | 'otherRoom' | 'lowerGoal' | 'emptyChoice' | 'instead';

const DEMOS: Record<TipDemoName, () => JSX.Element> = {
  gray: Gray,
  computer: Computer,
  homeScreen: HomeScreen,
  notifications: Notifications,
  bedroom: Bedroom,
  otherRoom: OtherRoom,
  lowerGoal: LowerGoal,
  emptyChoice: EmptyChoice,
  instead: Instead,
};

/** The demo drawn at the top of a tip's card. */
export function TipDemo({ name }: { name: TipDemoName }) {
  const Demo = DEMOS[name];
  return (
    <Stage>
      <Demo />
    </Stage>
  );
}
