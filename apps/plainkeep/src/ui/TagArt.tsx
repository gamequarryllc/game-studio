import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from './theme';

// The picture on the welcome screen and the empty list: two service tags on a
// nail, one marked done. Drawn for this app; the icon is the front tag alone.

export function TagArt({ width = 260 }: { width?: number }) {
  const { c, dark } = useTheme();
  const height = (width * 190) / 260;
  const tag = dark ? '#20262B' : '#FFFFFF';
  const edge = dark ? '#39414A' : '#C9CFCC';
  return (
    <Svg width={width} height={height} viewBox="0 0 260 190" accessibilityLabel="Two service tags hanging from a nail">
      {/* the nail and its shadow on the wall */}
      <Line x1="118" y1="14" x2="118" y2="30" stroke={c.ink3} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="118" cy="13" r="5" fill={c.ink2} />

      {/* the tag behind, swung to the right */}
      <G transform="rotate(13 118 30)">
        <Path d="M88 22 L148 22 L160 38 L160 168 L76 168 L76 38 Z" fill={c.amberSoft} stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
        <Circle cx="118" cy="38" r="6" fill={c.page} stroke={edge} strokeWidth="1.5" />
        <Rect x="90" y="62" width="56" height="5" rx="2.5" fill={c.amber} opacity="0.55" />
        <Rect x="90" y="76" width="38" height="5" rx="2.5" fill={c.amber} opacity="0.3" />
      </G>

      {/* the tag in front, swung a little left */}
      <G transform="rotate(-7 118 30)">
        <Path d="M84 22 L152 22 L166 40 L166 176 L70 176 L70 40 Z" fill={tag} stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
        <Circle cx="118" cy="40" r="6.5" fill={c.page} stroke={edge} strokeWidth="1.5" />
        {/* what the job is */}
        <Rect x="84" y="64" width="62" height="6" rx="3" fill={c.ink} />
        <Rect x="84" y="78" width="40" height="5" rx="2.5" fill={c.ink3} />
        {/* the rule: marks inked up to today, the tall one is the due day */}
        {Array.from({ length: 12 }, (_, i) => (
          <Rect key={i} x={84 + i * 6.2} y={i === 11 ? 100 : i % 3 === 0 ? 104 : 108} width="2.4" height={i === 11 ? 20 : i % 3 === 0 ? 16 : 12} rx="1.2" fill={i < 8 ? c.blue : i === 11 ? c.ink3 : c.rule} />
        ))}
        {/* the punched ring, done */}
        <Circle cx="136" cy="150" r="13" fill={c.blue} />
        <Path d="M129.5 150.5 L134.2 155 L142.5 145.5" fill="none" stroke={tag} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Rect x="84" y="146" width="30" height="5" rx="2.5" fill={c.ink3} opacity="0.6" />
      </G>
    </Svg>
  );
}
