import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/ui/theme';

// The picture on the welcome screen: three snapshots of things in a home, each
// with its price tag, standing in the manila folder. It says what the app does
// without a paragraph: photograph it, put a value on it, keep it on file.
//
// The snapshots are photo prints, so their paper and their pictures keep the
// same colours in dark mode; only the folder around them follows the theme.

interface Tones {
  back: string;
  front: string;
  edge: string;
  paper: string;
  label: string;
  labelInk: string;
  scribble: string;
  shadow: string;
  shadowOpacity: number;
}

const LIGHT: Tones = {
  back: '#DFC98F',
  front: '#EDDCB1',
  edge: '#D9C48B',
  paper: '#FFFDF8',
  label: '#FBF6E6',
  labelInk: '#C9B98A',
  scribble: '#D8D0BE',
  shadow: '#281E0A',
  shadowOpacity: 0.16,
};

const DARK: Tones = {
  back: '#37322A',
  front: '#2A2620',
  edge: '#443E33',
  paper: '#EFEAE0',
  label: '#3A352C',
  labelInk: '#6B6252',
  scribble: '#C9C1B0',
  shadow: '#000000',
  shadowOpacity: 0.45,
};

const GREEN = '#1E5B48';
const CHARCOAL = '#2B2925';
const WOOD = '#4A2F10';

function Armchair() {
  return (
    <G>
      <Ellipse cx={0} cy={27} rx={27} ry={3} fill="#3C2800" opacity={0.1} />
      <Rect x={-19} y={18} width={5} height={9} rx={2} fill="#5A3A12" />
      <Rect x={14} y={18} width={5} height={9} rx={2} fill="#5A3A12" />
      <Rect x={-19} y={-24} width={38} height={36} rx={11} fill={GREEN} />
      <Rect x={-27} y={-4} width={13} height={25} rx={6.5} fill="#174838" />
      <Rect x={14} y={-4} width={13} height={25} rx={6.5} fill="#174838" />
      <Rect x={-15} y={2} width={30} height={13} rx={5} fill="#2F7A60" />
      <Rect x={-22} y={12} width={44} height={9} rx={4.5} fill={GREEN} />
    </G>
  );
}

function Laptop() {
  return (
    <G>
      <Ellipse cx={0} cy={24} rx={30} ry={3} fill="#00281E" opacity={0.1} />
      <Rect x={-24} y={-20} width={48} height={34} rx={3.5} fill={CHARCOAL} />
      <Rect x={-21} y={-17} width={42} height={27} rx={1.5} fill="#F3EEE2" />
      <Path d="M-15 -10 h18 M-15 -4 h28 M-15 2 h12" stroke="#C7BFAE" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <Path d="M-31 14 H31 L27 21 a2 2 0 0 1 -1.8 1 H-25.2 a2 2 0 0 1 -1.8 -1 Z" fill="#45413A" />
      <Rect x={-6} y={14} width={12} height={2.4} rx={1.2} fill={CHARCOAL} />
    </G>
  );
}

function Guitar() {
  return (
    <G>
      <Ellipse cx={2} cy={27} rx={22} ry={3} fill="#3C2800" opacity={0.1} />
      <G transform="rotate(24) scale(0.86)">
        <Rect x={-2.8} y={-40} width={5.6} height={34} fill={WOOD} />
        <Rect x={-4.6} y={-49} width={9.2} height={11} rx={2.2} fill={CHARCOAL} />
        <Circle cx={0} cy={-5} r={11.5} fill="#C4872F" />
        <Circle cx={0} cy={12} r={16} fill="#C4872F" />
        <Circle cx={0} cy={3} r={4.8} fill={WOOD} />
        <Rect x={-7} y={17} width={14} height={3.2} rx={1.2} fill={WOOD} />
      </G>
    </G>
  );
}

/** One snapshot: a print with a picture, two lines of handwriting and a price tag. */
function Snapshot({
  x,
  y,
  turn,
  tint,
  lines,
  t,
  children,
}: {
  x: number;
  y: number;
  turn: number;
  tint: string;
  lines: [number, number];
  t: Tones;
  children: ReactNode;
}) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${turn})`}>
      <Rect x={-44} y={-55} width={92} height={116} rx={5} fill={t.shadow} opacity={t.shadowOpacity} />
      <Rect x={-46} y={-58} width={92} height={116} rx={5} fill={t.paper} />
      <Rect x={-38} y={-50} width={76} height={74} rx={2.5} fill={tint} />
      <G transform="translate(0 -13)">{children}</G>
      <Path d={`M-36 39 h${lines[0]} M-36 47 h${lines[1]}`} stroke={t.scribble} strokeWidth={3} strokeLinecap="round" fill="none" />
      <G transform="translate(22 45) rotate(-8)">
        <Path d="M-13 -8 H7 L14 0 L7 8 H-13 a3 3 0 0 1 -3 -3 V-5 a3 3 0 0 1 3 -3 Z" fill={GREEN} />
        <Circle cx={8.5} cy={0} r={1.9} fill={t.paper} />
        <Path
          d="M-4.2 3.1 c1.2 1 4.6 1 4.6 -1.3 c0 -2.6 -4.6 -1.3 -4.6 -3.8 c0 -2.2 3.2 -2.3 4.4 -1.3 M-1.9 -5.2 V5.2"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    </G>
  );
}

export const WELCOME_ART_RATIO = 340 / 222;

export function WelcomeArt() {
  const { dark } = useTheme();
  const t = dark ? DARK : LIGHT;
  return (
    // The box sets the size (full width, fixed shape) and the drawing fills it: the same on iPhone and in the web preview.
    <View
      testID="welcome-art"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Three snapshots in a folder: an armchair, a laptop and a guitar, each with a price tag."
      style={{ width: '100%', aspectRatio: WELCOME_ART_RATIO }}>
      <Svg width="100%" height="100%" viewBox="0 0 340 222">
      <Path d="M22 208 V34 a12 12 0 0 1 12 -12 H116 a11 11 0 0 1 9 4.8 L137 44 H306 a12 12 0 0 1 12 12 V208 Z" fill={t.back} />
      <Snapshot x={84} y={112} turn={-9} tint="#F5E6CC" lines={[26, 16]} t={t}>
        <Armchair />
      </Snapshot>
      <Snapshot x={258} y={113} turn={9} tint="#EFE9DC" lines={[22, 30]} t={t}>
        <Guitar />
      </Snapshot>
      <Snapshot x={171} y={100} turn={1.5} tint="#DFEBE5" lines={[30, 20]} t={t}>
        <Laptop />
      </Snapshot>
      <Path d="M22 186 a14 14 0 0 1 14 -14 H304 a14 14 0 0 1 14 14 V206 a14 14 0 0 1 -14 14 H36 a14 14 0 0 1 -14 -14 Z" fill={t.front} />
      <Path d="M36 172.6 H304" stroke={t.edge} strokeWidth={1.2} fill="none" />
      <Rect x={42} y={186} width={92} height={20} rx={4} fill={t.label} />
        <Path d="M52 196 h46" stroke={t.labelInk} strokeWidth={3} strokeLinecap="round" fill="none" />
      </Svg>
    </View>
  );
}
