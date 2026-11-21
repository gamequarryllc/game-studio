import { useRouter } from 'expo-router';
import { Platform, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { setOnboarded } from '@/domain/actions';
import { thump } from '@/platform/haptics';
import { store } from '@/state/store';
import { Button } from '@/ui/kit';
import { NO_ORPHAN, serif, space, type, useTheme } from '@/ui/theme';

// The first screen of a new map.

/** A globe with a few pins in it: drawn, since the real one comes next. */
function GlobeArt({ size }: { size: number }) {
  const { c, dark } = useTheme();
  const pins: [number, number, string][] = [
    [112, 104, c.accent],
    [168, 138, '#D99A1F'],
    [88, 168, '#2F8F5B'],
    [196, 86, '#2478B5'],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 280 280">
      <Defs>
        <RadialGradient id="wsea" cx="36%" cy="30%" r="80%">
          <Stop offset="0" stopColor={c.sea} />
          <Stop offset="1" stopColor={c.seaDeep} />
        </RadialGradient>
      </Defs>
      <Circle cx={140} cy={140} r={128} fill={dark ? '#3D6FB5' : '#9CC3D6'} opacity={0.22} />
      <Circle cx={140} cy={140} r={112} fill="url(#wsea)" />
      {/* Lines of latitude and longitude, as on a desk globe. */}
      <G stroke={dark ? '#FFFFFF' : '#1A2133'} strokeOpacity={dark ? 0.1 : 0.1} strokeWidth={1} fill="none">
        <Ellipse cx={140} cy={140} rx={112} ry={40} />
        <Ellipse cx={140} cy={140} rx={112} ry={84} />
        <Ellipse cx={140} cy={140} rx={40} ry={112} />
        <Ellipse cx={140} cy={140} rx={84} ry={112} />
      </G>
      {/* Land, loosely: nowhere in particular. */}
      <Path d="M70 86 C92 60 132 58 150 74 C168 88 150 104 158 122 C166 142 198 132 204 156 C210 182 178 200 156 190 C136 182 140 160 120 152 C98 144 82 160 66 142 C52 126 56 102 70 86 Z" fill={c.land} stroke={c.landEdge} strokeWidth={1} />
      <Path d="M186 62 C204 58 226 76 228 96 C230 112 212 112 202 100 C194 90 176 72 186 62 Z" fill={c.land} stroke={c.landEdge} strokeWidth={1} />
      <Path d="M84 190 C100 182 120 196 116 214 C112 230 90 232 80 218 C72 208 74 196 84 190 Z" fill={c.land} stroke={c.landEdge} strokeWidth={1} />
      {pins.map(([x, y, color]) => (
        <G key={`${x}-${y}`}>
          <Ellipse cx={x} cy={y + 1} rx={5} ry={2} fill="#000" opacity={0.2} />
          <Path d={`M${x} ${y} C${x} ${y} ${x - 10} ${y - 16} ${x - 10} ${y - 23} A10 10 0 1 1 ${x + 10} ${y - 23} C${x + 10} ${y - 16} ${x} ${y} ${x} ${y} Z`} fill={color} stroke="#FFFDF8" strokeWidth={1.6} />
          <Circle cx={x} cy={y - 23} r={3.4} fill="#FFFDF8" />
        </G>
      ))}
    </Svg>
  );
}

export default function Welcome() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const art = Math.min(Math.min(width, 480) - 56, height * 0.4, 340);

  const start = () => {
    thump();
    store.update((d, now) => setOnboarded(d, now));
    router.replace('/');
  };

  return (
    <View testID="welcome-screen" style={{ flex: 1, backgroundColor: c.page, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + (Platform.OS === 'web' ? space.xl : space.m), paddingHorizontal: space.xxl }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <GlobeArt size={art} />
      </View>
      <View style={{ paddingBottom: space.xxl }}>
        <Text style={[type.margin, { color: c.accent }]}>Your own map of the world</Text>
        <Text accessibilityRole="header" style={[NO_ORPHAN, { fontFamily: serif.regular, fontSize: 46, lineHeight: 48, letterSpacing: -0.6, color: c.ink, marginTop: space.s }]}>
          Everywhere{'\n'}you’ve been,{'\n'}
          <Text style={{ fontFamily: serif.italic }}>pinned.</Text>
        </Text>
        <Text style={[type.body, { color: c.ink2, marginTop: space.l }]}>Put a pin where you went. Add the photos, the day, who came along and what you did. It all stays on this iPhone.</Text>
      </View>
      <Button testID="welcome-start" label="Open the map" onPress={start} />
    </View>
  );
}
