import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/ui/theme';

// A file cabinet: one place (a home, an office, a storage unit). The cabinet
// being looked at has its top drawer pulled out, with the folders' tabs
// showing. `empty` is the outline of a cabinet that isn't there yet.

interface Tones {
  body: string;
  front: string;
  edge: string;
  pull: string;
  plate: string;
  plateInk: string;
  shade: string;
  shadeOpacity: number;
}

const LIGHT: Tones = { body: '#CFC8B7', front: '#E4DED0', edge: '#B9B19F', pull: '#9E9684', plate: '#FBF6E6', plateInk: '#C9B98A', shade: '#281E0A', shadeOpacity: 0.16 };
const DARK: Tones = { body: '#2B2823', front: '#3A3630', edge: '#4C473E', pull: '#7A7366', plate: '#262320', plateInk: '#5F584B', shade: '#000000', shadeOpacity: 0.5 };

export const CABINET_RATIO = 120 / 132;

function Drawer({ y, t, out }: { y: number; t: Tones; out?: boolean }) {
  // A drawer that is out stands a little proud of the cabinet: wider, lower, with a shadow under it.
  const x = out ? 16 : 22;
  const w = out ? 88 : 76;
  const top = out ? y + 8 : y;
  return (
    <>
      {out ? <Rect x={x + 3} y={top + 5} width={w - 6} height={46} rx={6} fill={t.shade} opacity={t.shadeOpacity} /> : null}
      <Rect x={x} y={top} width={w} height={46} rx={5.5} fill={t.front} stroke={t.edge} strokeWidth={1} />
      <Rect x={44} y={top + 8} width={32} height={12} rx={2.5} fill={t.plate} />
      <Path d={`M49 ${top + 14} h18`} stroke={t.plateInk} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Rect x={46} y={top + 29} width={28} height={6.5} rx={3.25} fill={t.pull} />
    </>
  );
}

export function CabinetArt({ open, empty }: { open?: boolean; empty?: boolean }) {
  const { c, dark } = useTheme();
  const t = dark ? DARK : LIGHT;
  return (
    <View style={{ width: '100%', aspectRatio: CABINET_RATIO }}>
      <Svg width="100%" height="100%" viewBox="0 0 120 132">
        {empty ? (
          <>
            <Rect x={15} y={11} width={90} height={112} rx={9} fill="none" stroke={c.ink3} strokeWidth={1.6} strokeDasharray="5 5" />
            <Path d="M60 53 v28 M46 67 h28" stroke={c.green} strokeWidth={3.2} strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <Rect x={24} y={120} width={10} height={8} rx={2} fill={t.edge} />
            <Rect x={86} y={120} width={10} height={8} rx={2} fill={t.edge} />
            <Rect x={14} y={10} width={92} height={114} rx={9} fill={t.body} />
            {open ? (
              <>
                {/* The folders in the open drawer: three tabs, stepped across like the ones on the Rooms screen. */}
                <Rect x={24} y={13} width={26} height={22} rx={4} fill={c.manilaEdge} />
                <Rect x={47} y={10} width={26} height={24} rx={4} fill={dark ? c.manilaTab : c.manila} />
                <Rect x={70} y={14} width={26} height={22} rx={4} fill={c.manilaEdge} />
              </>
            ) : null}
            <Drawer y={18} t={t} out={open} />
            <Drawer y={open ? 76 : 70} t={t} />
          </>
        )}
      </Svg>
    </View>
  );
}
