import { memo, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import type { Scene } from '@/domain/types';

// The drawn pictures the sample map uses where photos would be: small flat
// landscapes, a different one for every seed. They are stand-ins, drawn to look
// like stand-ins, so nobody mistakes the sample map for someone's real trip.

const W = 400;
const H = 300;

function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sky {
  top: string;
  bottom: string;
  sun: string;
  /** Far things take this tint. */
  far: string;
  water: string;
  waterDeep: string;
}

const SKIES: Sky[] = [
  // Clear midday
  { top: '#5FA8D6', bottom: '#CFE8F2', sun: '#FFF6D8', far: '#8FB6C9', water: '#3F8FBF', waterDeep: '#1F5F92' },
  // Golden hour
  { top: '#F2A65A', bottom: '#FBE3B4', sun: '#FFF1C9', far: '#C9906B', water: '#E08E5B', waterDeep: '#8C4A52' },
  // Dusk
  { top: '#3B3F78', bottom: '#F29C8B', sun: '#FFD3A8', far: '#6B5C8E', water: '#7A5C90', waterDeep: '#33325F' },
  // Soft morning
  { top: '#9CC7D8', bottom: '#F4EAD6', sun: '#FFFFFF', far: '#A9C2C4', water: '#6FAFC2', waterDeep: '#3C7F97' },
];

/** A rolling line across the picture at about height `y`, closed along the bottom. */
function hill(r: () => number, y: number, rough: number, steps = 5): string {
  let d = `M0 ${H} L0 ${y + (r() - 0.5) * rough}`;
  const step = W / steps;
  for (let i = 1; i <= steps; i++) {
    const x = i * step;
    const cy = y + (r() - 0.5) * rough * 2;
    const ey = y + (r() - 0.5) * rough;
    d += ` Q${x - step / 2} ${cy} ${x} ${ey}`;
  }
  return `${d} L${W} ${H} Z`;
}

function pine(x: number, base: number, h: number, fill: string, key: string): ReactNode {
  const w = h * 0.42;
  return (
    <G key={key}>
      <Rect x={x - 1.5} y={base - h * 0.2} width={3} height={h * 0.22} fill="#4A3628" />
      <Polygon points={`${x},${base - h} ${x - w / 2},${base - h * 0.45} ${x + w / 2},${base - h * 0.45}`} fill={fill} />
      <Polygon points={`${x},${base - h * 0.75} ${x - w * 0.7},${base - h * 0.15} ${x + w * 0.7},${base - h * 0.15}`} fill={fill} />
    </G>
  );
}

function pines(r: () => number, base: number, n: number, minH: number, maxH: number, fill: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) out.push(pine(((i + 0.2 + r() * 0.6) / n) * W, base + r() * 8, minH + r() * (maxH - minH), fill, `${key}${i}`));
  return out;
}

function water(sky: Sky, y: number, id: string): ReactNode {
  return (
    <G key="water">
      <Rect x={0} y={y} width={W} height={H - y} fill={`url(#${id}w)`} />
      <Rect x={0} y={y} width={W} height={2} fill="#FFFFFF" opacity={0.35} />
    </G>
  );
}

function glints(r: () => number, y0: number, y1: number, n: number): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + r() * (y1 - y0);
    const len = 14 + r() * 40;
    out.push(<Rect key={`gl${i}`} x={r() * (W - len)} y={y} width={len} height={1.6} rx={0.8} fill="#FFFFFF" opacity={0.18 + r() * 0.25} />);
  }
  return out;
}

function lighthouse(x: number, base: number, h: number, body: string): ReactNode {
  const w = h * 0.2;
  return (
    <G key="lh">
      <Polygon points={`${x - w / 2},${base} ${x + w / 2},${base} ${x + w * 0.32},${base - h * 0.74} ${x - w * 0.32},${base - h * 0.74}`} fill={body} />
      <Polygon points={`${x - w * 0.43},${base - h * 0.3} ${x + w * 0.43},${base - h * 0.3} ${x + w * 0.39},${base - h * 0.46} ${x - w * 0.39},${base - h * 0.46}`} fill="#FBF6EA" />
      <Rect x={x - w * 0.42} y={base - h * 0.78} width={w * 0.84} height={h * 0.045} fill="#2B2F3A" />
      <Rect x={x - w * 0.26} y={base - h * 0.9} width={w * 0.52} height={h * 0.12} fill="#FFE9A8" />
      <Polygon points={`${x - w * 0.34},${base - h * 0.9} ${x + w * 0.34},${base - h * 0.9} ${x},${base - h}`} fill="#2B2F3A" />
    </G>
  );
}

function scene(kind: Scene, seed: number, id: string): { sky: Sky; body: ReactNode[]; sunAt: [number, number] | null } {
  const r = rng(seed + 1);
  const sky = SKIES[Math.floor(r() * SKIES.length)];
  const sunAt: [number, number] = [70 + r() * 260, 50 + r() * 60];
  const body: ReactNode[] = [];

  switch (kind) {
    case 'beach': {
      const horizon = 138 + r() * 14;
      body.push(water(sky, horizon, id), ...glints(r, horizon + 8, 205, 9));
      body.push(<Path key="foam" d={hill(r, 212, 10, 4)} fill="#FFFFFF" opacity={0.75} />);
      body.push(<Path key="sand" d={hill(r, 220, 12, 4)} fill="#EED9A6" />);
      body.push(<Path key="sand2" d={hill(r, 262, 16, 3)} fill="#E3C88C" />);
      const ux = 90 + r() * 220;
      const hue = ['#D2432A', '#2478B5', '#E0A422', '#1F9488'][Math.floor(r() * 4)];
      body.push(
        <G key="umb">
          <Line x1={ux} y1={206} x2={ux + 6} y2={266} stroke="#6B5A45" strokeWidth={2.5} />
          <Path d={`M${ux - 38} 214 Q${ux} 168 ${ux + 38} 214 Z`} fill={hue} />
          <Path d={`M${ux - 13} 214 Q${ux} 172 ${ux + 13} 214 Z`} fill="#FBF6EA" />
        </G>,
      );
      break;
    }
    case 'dunes': {
      const horizon = 120 + r() * 16;
      body.push(water(sky, horizon, id), ...glints(r, horizon + 6, 160, 5));
      body.push(<Path key="d1" d={hill(r, 172, 34, 3)} fill="#E9D5A2" />);
      body.push(<Path key="d2" d={hill(r, 214, 40, 3)} fill="#DDC388" />);
      body.push(<Path key="d3" d={hill(r, 258, 24, 4)} fill="#CFB06F" />);
      for (let i = 0; i < 16; i++) {
        const x = r() * W;
        const y = 226 + r() * 60;
        body.push(<Path key={`g${i}`} d={`M${x} ${y} q-4 -16 -9 -20 M${x} ${y} q1 -18 0 -24 M${x} ${y} q5 -14 10 -17`} stroke="#6F8B4E" strokeWidth={1.6} fill="none" strokeLinecap="round" />);
      }
      break;
    }
    case 'lighthouse': {
      const horizon = 150 + r() * 14;
      body.push(water(sky, horizon, id), ...glints(r, horizon + 8, 250, 12));
      const left = r() < 0.5;
      const x = left ? 110 + r() * 50 : 240 + r() * 50;
      const pierY = horizon + 34;
      body.push(<Polygon key="pier" points={left ? `${W},${pierY + 26} ${W},${pierY + 44} ${x - 30},${pierY + 10} ${x - 30},${pierY}` : `0,${pierY + 26} 0,${pierY + 44} ${x + 30},${pierY + 10} ${x + 30},${pierY}`} fill="#B9B2A3" />);
      body.push(<Rect key="foot" x={x - 24} y={pierY - 8} width={48} height={18} fill="#8E8779" />);
      body.push(lighthouse(x, pierY - 8, 118, ['#C4412B', '#FBF6EA', '#2B2F3A'][Math.floor(r() * 3)] === '#FBF6EA' ? '#E9E2D2' : '#C4412B'));
      break;
    }
    case 'forest': {
      body.push(<Path key="far" d={hill(r, 150, 30)} fill={sky.far} opacity={0.75} />);
      body.push(...pines(r, 205, 11, 60, 110, '#3F6B52', 'a'));
      body.push(<Path key="mid" d={hill(r, 210, 14)} fill="#5C8457" />);
      body.push(...pines(r, 268, 7, 110, 190, '#234535', 'b'));
      body.push(<Path key="near" d={hill(r, 272, 10)} fill="#2F5A3C" />);
      break;
    }
    case 'lake': {
      const horizon = 150 + r() * 10;
      body.push(<Path key="far" d={hill(r, horizon - 18, 16)} fill={sky.far} />);
      body.push(...pines(r, horizon + 2, 14, 22, 46, '#35604A', 'a'));
      body.push(water(sky, horizon, id), ...glints(r, horizon + 10, 280, 12));
      const cx = 120 + r() * 160;
      body.push(
        <G key="canoe">
          <Path d={`M${cx - 40} 226 Q${cx} 242 ${cx + 40} 226 Q${cx} 232 ${cx - 40} 226 Z`} fill="#C4412B" />
          <Ellipse cx={cx} cy={240} rx={36} ry={3} fill="#000000" opacity={0.12} />
        </G>,
      );
      break;
    }
    case 'river': {
      body.push(<Path key="far" d={hill(r, 150, 22)} fill={sky.far} />);
      for (let i = 0; i < 7; i++) {
        const x = i * 60 + r() * 20;
        const h = 28 + r() * 44;
        body.push(<Rect key={`b${i}`} x={x} y={172 - h} width={34 + r() * 16} height={h} fill={i % 2 ? '#7C8597' : '#5E687C'} />);
      }
      body.push(water(sky, 172, id), ...glints(r, 196, 290, 10));
      const tint = ['#2E6FB0', '#B4472E', '#3F7F6B'][Math.floor(r() * 3)];
      body.push(
        <G key="bridge">
          <Rect x={0} y={150} width={W} height={7} fill={tint} />
          {[40, 130, 220, 310].map((x) => (
            <Path key={x} d={`M${x} 157 Q${x + 45} 108 ${x + 90} 157`} stroke={tint} strokeWidth={5} fill="none" />
          ))}
          {[40, 130, 220, 310, 400].map((x) => (
            <Rect key={`p${x}`} x={x - 5} y={150} width={10} height={34} fill="#3A4152" />
          ))}
        </G>,
      );
      break;
    }
    case 'city': {
      const night = sky === SKIES[2];
      for (let layer = 0; layer < 2; layer++) {
        let x = -10;
        let i = 0;
        while (x < W) {
          const w = 30 + r() * 34;
          const h = (layer === 0 ? 70 : 110) + r() * (layer === 0 ? 70 : 90);
          const top = 262 - h;
          body.push(<Rect key={`c${layer}-${i}`} x={x} y={top} width={w} height={h} fill={layer === 0 ? sky.far : i % 2 ? '#3A4560' : '#2B3550'} />);
          if (layer === 1) {
            for (let wy = top + 10; wy < 250; wy += 14) {
              for (let wx = x + 6; wx < x + w - 8; wx += 10) {
                if (r() < 0.55) body.push(<Rect key={`w${i}-${wy}-${wx}`} x={wx} y={wy} width={5} height={7} fill={night ? '#FFD98A' : '#DCE7F2'} opacity={night ? 0.95 : 0.55} />);
              }
            }
          }
          x += w + (layer === 0 ? 4 : 8);
          i += 1;
        }
      }
      body.push(<Rect key="street" x={0} y={262} width={W} height={38} fill="#20283A" />);
      body.push(<Rect key="line" x={0} y={279} width={W} height={2} fill="#FFFFFF" opacity={0.22} />);
      break;
    }
    case 'garden': {
      body.push(<Path key="far" d={hill(r, 128, 12)} fill={sky.far} />);
      body.push(...pines(r, 150, 9, 26, 44, '#3F6B52', 'a'));
      body.push(<Rect key="field" x={0} y={148} width={W} height={152} fill="#4E8B4A" />);
      const blooms = ['#D2432A', '#F0B429', '#E86A92', '#F4EFE6', '#8E5FB0', '#F28C38'];
      const vx = 150 + r() * 100;
      for (let i = 0; i < 9; i++) {
        const x0 = -180 + i * 95;
        const x1 = x0 + 62;
        body.push(<Polygon key={`row${i}`} points={`${vx - 4 + (i - 4) * 5},150 ${vx + 4 + (i - 4) * 5},150 ${x1},${H} ${x0},${H}`} fill={blooms[(i + Math.floor(r() * 6)) % blooms.length]} opacity={0.95} />);
      }
      if (r() < 0.6) {
        const mx = r() < 0.5 ? 70 : 320;
        body.push(
          <G key="mill">
            <Polygon points={`${mx - 14},150 ${mx + 14},150 ${mx + 8},104 ${mx - 8},104`} fill="#6D4B34" />
            <Polygon points={`${mx - 10},104 ${mx + 10},104 ${mx},92`} fill="#3D2A1F" />
            <Line x1={mx - 30} y1={78} x2={mx + 30} y2={126} stroke="#F4EFE6" strokeWidth={3} />
            <Line x1={mx + 30} y1={78} x2={mx - 30} y2={126} stroke="#F4EFE6" strokeWidth={3} />
          </G>,
        );
      }
      break;
    }
    case 'mountain': {
      const peaks = (base: number, n: number, minH: number, maxH: number, fill: string, snow: boolean, key: string) => {
        for (let i = 0; i < n; i++) {
          const x = ((i + 0.5 + (r() - 0.5) * 0.5) / n) * W;
          const h = minH + r() * (maxH - minH);
          const half = h * (0.7 + r() * 0.3);
          body.push(<Polygon key={`${key}${i}`} points={`${x - half},${base} ${x},${base - h} ${x + half},${base}`} fill={fill} />);
          if (snow) body.push(<Polygon key={`${key}s${i}`} points={`${x - half * 0.24},${base - h * 0.76} ${x},${base - h} ${x + half * 0.24},${base - h * 0.76} ${x + half * 0.08},${base - h * 0.7} ${x - half * 0.06},${base - h * 0.74}`} fill="#FBFBF8" />);
        }
      };
      peaks(214, 4, 90, 150, sky.far, true, 'f');
      peaks(232, 3, 60, 110, '#52657F', false, 'm');
      body.push(...pines(r, 246, 13, 22, 40, '#2B4E3D', 'a'));
      body.push(water(sky, 244, id), ...glints(r, 252, 292, 6));
      break;
    }
    case 'snow': {
      body.push(<Path key="far" d={hill(r, 140, 30)} fill="#C9D8E6" />);
      body.push(...pines(r, 196, 9, 50, 90, '#3C5C5A', 'a'));
      body.push(<Path key="mid" d={hill(r, 200, 22)} fill="#EAF1F7" />);
      body.push(...pines(r, 262, 5, 90, 150, '#27433F', 'b'));
      body.push(<Path key="near" d={hill(r, 262, 16)} fill="#FBFDFF" />);
      for (let i = 0; i < 46; i++) body.push(<Circle key={`fl${i}`} cx={r() * W} cy={r() * H} r={1 + r() * 1.8} fill="#FFFFFF" opacity={0.6 + r() * 0.4} />);
      break;
    }
    case 'market': {
      body.push(<Rect key="wall" x={0} y={0} width={W} height={H} fill="#F1E3C8" />);
      const stripe = ['#D2432A', '#2F8F5B', '#2478B5', '#E0A422'][Math.floor(r() * 4)];
      for (let i = 0; i < 10; i++) body.push(<Rect key={`aw${i}`} x={i * 40} y={0} width={40} height={74} fill={i % 2 ? stripe : '#FBF6EA'} />);
      for (let i = 0; i < 10; i++) body.push(<Path key={`sc${i}`} d={`M${i * 40} 74 q20 22 40 0 Z`} fill={i % 2 ? stripe : '#FBF6EA'} />);
      body.push(<Rect key="shade" x={0} y={74} width={W} height={10} fill="#000000" opacity={0.08} />);
      const fruit = ['#E4572E', '#F0B429', '#7FB069', '#B5446E', '#F28C38', '#8E5FB0'];
      for (let c = 0; c < 4; c++) {
        const x = 14 + c * 96;
        const hue = fruit[Math.floor(r() * fruit.length)];
        body.push(<Rect key={`cr${c}`} x={x} y={168} width={84} height={70} rx={3} fill="#A9743F" />);
        body.push(<Rect key={`crt${c}`} x={x} y={168} width={84} height={9} fill="#8A5B2E" />);
        for (let k = 0; k < 9; k++) body.push(<Circle key={`f${c}-${k}`} cx={x + 14 + (k % 3) * 28 + r() * 4} cy={150 + Math.floor(k / 3) * 12 + r() * 3} r={11} fill={hue} opacity={0.82 + (k % 3) * 0.06} />);
      }
      body.push(<Rect key="table" x={0} y={238} width={W} height={62} fill="#6E4A2A" />);
      break;
    }
    case 'hall': {
      body.push(<Path key="far" d={hill(r, 196, 10)} fill={sky.far} />);
      const stone = ['#EFE6D2', '#E4DACA', '#D9C9A8'][Math.floor(r() * 3)];
      body.push(<Polygon key="ped" points="70,112 330,112 200,58" fill={stone} />);
      body.push(<Polygon key="pedin" points="108,106 292,106 200,70" fill="#000000" opacity={0.08} />);
      body.push(<Rect key="beam" x={62} y={112} width={276} height={16} fill={stone} />);
      for (let i = 0; i < 6; i++) {
        const x = 84 + i * 46;
        body.push(<Rect key={`col${i}`} x={x - 9} y={128} width={18} height={104} fill={stone} />);
        body.push(<Rect key={`sh${i}`} x={x + 3} y={128} width={6} height={104} fill="#000000" opacity={0.07} />);
      }
      body.push(<Rect key="dark" x={93} y={128} width={212} height={104} fill="#2B3142" opacity={0.28} />);
      for (let i = 0; i < 6; i++) body.push(<Rect key={`colf${i}`} x={75 + i * 46} y={128} width={18} height={104} fill={stone} />);
      const banner = ['#C4412B', '#2478B5', '#8757A6'][Math.floor(r() * 3)];
      body.push(<Rect key="ban" x={190} y={136} width={20} height={64} fill={banner} />);
      body.push(<Rect key="s1" x={50} y={232} width={300} height={12} fill="#CFC4AE" />);
      body.push(<Rect key="s2" x={36} y={244} width={328} height={12} fill="#BFB39B" />);
      body.push(<Rect key="s3" x={0} y={256} width={W} height={44} fill="#9C927E" />);
      break;
    }
  }
  return { sky, body, sunAt: kind === 'market' ? null : sunAt };
}

export const SceneArt = memo(function SceneArt({ scene: kind, seed, style }: { scene: Scene; seed: number; style?: StyleProp<ViewStyle> }) {
  const id = `sc${kind}${seed}`;
  const { sky, body, sunAt } = scene(kind, seed, id);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={style}>
      <Defs>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky.top} />
          <Stop offset="0.72" stopColor={sky.bottom} />
        </LinearGradient>
        <LinearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky.water} />
          <Stop offset="1" stopColor={sky.waterDeep} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${id}s)`} />
      {sunAt ? (
        <G>
          <Circle cx={sunAt[0]} cy={sunAt[1]} r={34} fill={sky.sun} opacity={0.28} />
          <Circle cx={sunAt[0]} cy={sunAt[1]} r={19} fill={sky.sun} />
        </G>
      ) : null}
      {body}
    </Svg>
  );
});
