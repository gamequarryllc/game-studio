import { Platform, useColorScheme, type TextStyle } from 'react-native';

// The look: a field atlas. Warm chart paper by day and the same chart by lamplight at
// night, one vermilion for the pin and everything you can press, a serif for
// the names of places and small spaced capitals for the things a map prints
// in its margins (coordinates, dates, a legend). Art direction: NOTES.md.

export interface Colors {
  /** Chart paper. */
  page: string;
  /** A card laid on the paper. */
  card: string;
  /** Wells: inputs, a pressed row. */
  sunk: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  /** Vermilion: the pin, and anything that can be pressed. */
  accent: string;
  accentSoft: string;
  button: string;
  onButton: string;
  /** Destructive. */
  red: string;
  /** Gold leaf: a favourite. */
  gold: string;
  /** Open water, for the drawn globe. */
  sea: string;
  seaDeep: string;
  land: string;
  landEdge: string;
  /** Floating controls over the map. */
  glass: string;
  glassEdge: string;
  scrim: string;
  bar: string;
  raised: string;
}

export const LIGHT: Colors = {
  page: '#F3EEE2',
  card: '#FFFCF5',
  sunk: '#E8E1D0',
  ink: '#1A2133',
  ink2: '#5A6072',
  ink3: '#8B8FA0',
  rule: '#DCD4C1',
  accent: '#D2432A',
  accentSoft: '#F6DED5',
  button: '#D2432A',
  onButton: '#FFFDF8',
  red: '#B3261E',
  gold: '#B98A1C',
  sea: '#BFD9E4',
  seaDeep: '#8DBACD',
  land: '#F4EBD3',
  landEdge: '#B9AD8C',
  glass: 'rgba(255,252,245,0.92)',
  glassEdge: 'rgba(26,33,51,0.10)',
  scrim: 'rgba(20,24,36,0.45)',
  bar: 'rgba(250,246,236,0.94)',
  raised: '#FFFFFF',
};

export const DARK: Colors = {
  page: '#14110D',
  card: '#1F1B15',
  sunk: '#2B261E',
  ink: '#F2ECDF',
  ink2: '#B8AF9D',
  ink3: '#8A8171',
  rule: '#342E24',
  accent: '#F0704F',
  accentSoft: '#3B211C',
  button: '#D2432A',
  onButton: '#FFFDF8',
  red: '#FF6B5E',
  gold: '#E3B64B',
  sea: '#16293A',
  seaDeep: '#0D1A26',
  land: '#3B3527',
  landEdge: '#6E6348',
  glass: 'rgba(31,27,21,0.90)',
  glassEdge: 'rgba(242,236,223,0.12)',
  scrim: 'rgba(0,0,0,0.62)',
  bar: 'rgba(24,21,16,0.94)',
  raised: '#4A4335',
};

export interface Theme {
  dark: boolean;
  c: Colors;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return { dark, c: dark ? DARK : LIGHT };
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, huge: 40 } as const;
/** Photos are cut like prints: a small corner. Cards and sheets take the iPhone's rounder one. */
export const radius = { print: 6, m: 14, l: 22 } as const;

/** Instrument Serif, loaded in the root layout: the names of places. */
export const serif = { regular: 'InstrumentSerif_400Regular', italic: 'InstrumentSerif_400Regular_Italic' } as const;

/** A text serif for reading: New York on an iPhone. */
const TEXT_SERIF = Platform.select({ ios: 'ui-serif', android: 'serif', default: 'ui-serif, "New York", Georgia, serif' });

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });

/** Body sizes follow the iOS text styles so Dynamic Type scales them as people expect. */
export const type = {
  /** A screen's title. */
  largeTitle: { fontFamily: serif.regular, fontSize: 40, lineHeight: 44, letterSpacing: -0.4 },
  /** A place's name on its own page. */
  placeTitle: { fontFamily: serif.regular, fontSize: 36, lineHeight: 39, letterSpacing: -0.3 },
  title: { fontFamily: serif.regular, fontSize: 26, lineHeight: 30, letterSpacing: -0.2 },
  /** A place's name on a card or a row. */
  name: { fontFamily: serif.regular, fontSize: 22, lineHeight: 25, letterSpacing: -0.1 },
  /** The story: a text serif at reading size. */
  story: { fontFamily: TEXT_SERIF, fontSize: 17, lineHeight: 26 },
  /** Margin lettering: small spaced capitals. */
  margin: { fontSize: 11, lineHeight: 14, letterSpacing: 1.3, fontWeight: '600', textTransform: 'uppercase' },
  /** Coordinates. */
  mono: { fontFamily: MONO, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;

/** Room for the tab bar under a tab screen. */
export const TAB_BAR_SPACE = Platform.select({ web: 84, default: 96 }) ?? 96;

export const HAIRLINE = Platform.select({ web: 1, default: 0.5 }) ?? 0.5;

/** Keeps a single short word from being left alone on the last line of a title. */
export const NO_ORPHAN = (Platform.OS === 'web' ? { textWrap: 'pretty' } : {}) as object;

/** Browsers draw a focus ring round a text field; the form's own layout already shows where you are. */
export const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

/** A soft shadow for things that float over the map. */
export const FLOAT_SHADOW = Platform.select({
  web: { boxShadow: '0 6px 24px rgba(10,16,30,0.22)' } as object,
  default: { shadowColor: '#0A101E', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
}) as object;
