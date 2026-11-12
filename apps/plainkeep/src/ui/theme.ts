import { Platform, useColorScheme, type TextStyle } from 'react-native';

// Plainkeep's look: the service tag. The cool white of a workshop wall, enamel
// blue, and the condensed lettering of an equipment plate for every figure.
// Three colours carry meaning and nothing else does: blue is in good time,
// amber is coming up, red is past due. The art direction notes are in NOTES.md.

export interface Colors {
  /** The wall behind everything. */
  page: string;
  /** Tags, lists, forms. */
  card: string;
  /** Wells: inputs, a pressed row. */
  sunk: string;
  /** The marks of a rule that are still to come. */
  mark: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  /** Enamel blue: actions, and anything in good time. */
  blue: string;
  blueSoft: string;
  /** Filled buttons. */
  button: string;
  onButton: string;
  /** Coming up. */
  amber: string;
  amberSoft: string;
  /** Past due. */
  red: string;
  redSoft: string;
  /** The dark plate an odometer's figures sit on. */
  plate: string;
  onPlate: string;
  plateRule: string;
  scrim: string;
  bar: string;
  /** The chosen segment of a segmented control: lighter than its track in both modes. */
  raised: string;
}

export const LIGHT: Colors = {
  page: '#ECEEEC',
  card: '#FFFFFF',
  sunk: '#E1E5E3',
  mark: '#CCD2CF',
  ink: '#161A1E',
  ink2: '#57616A',
  ink3: '#8C959C',
  rule: '#D5DAD8',
  blue: '#1D4F7C',
  blueSoft: '#DAE5EF',
  button: '#1D4F7C',
  onButton: '#FFFFFF',
  amber: '#9A5A06',
  amberSoft: '#F5E7CD',
  red: '#B3331B',
  redSoft: '#F6DDD6',
  plate: '#1B2026',
  onPlate: '#F3F5F4',
  plateRule: '#343B43',
  scrim: 'rgba(22,26,30,0.42)',
  bar: '#F5F7F6',
  raised: '#FFFFFF',
};

export const DARK: Colors = {
  page: '#0F1215',
  card: '#191D21',
  sunk: '#242A2F',
  mark: '#4B545C',
  ink: '#ECEFF0',
  ink2: '#A1AAB2',
  ink3: '#7E878F',
  rule: '#2B3137',
  blue: '#8ABBE8',
  blueSoft: '#1A2937',
  button: '#2A6AA6',
  onButton: '#FFFFFF',
  amber: '#E6AC53',
  amberSoft: '#32281A',
  red: '#F27A61',
  redSoft: '#3A1F1A',
  plate: '#2C333A',
  onPlate: '#F3F5F4',
  plateRule: '#454D56',
  scrim: 'rgba(0,0,0,0.6)',
  bar: '#14181B',
  raised: '#3B434B',
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
/** Small squares (a stamp, an odometer) are cut square; cards and buttons take the iPhone's own rounder corner. */
export const radius = { s: 4, m: 12, l: 16 } as const;

/** Barlow Condensed, loaded in the root layout. Titles and every figure. */
export const plate = { medium: 'BarlowCondensed_500Medium', semibold: 'BarlowCondensed_600SemiBold' } as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** Body sizes follow the iOS text styles so Dynamic Type scales them as people expect. */
export const type = {
  largeTitle: { fontFamily: plate.semibold, fontSize: 40, lineHeight: 48, letterSpacing: 0.2 },
  title: { fontFamily: plate.semibold, fontSize: 28, lineHeight: 34, letterSpacing: 0.2 },
  /** A figure that is the point of the screen: days left, an odometer. */
  figure: { fontFamily: plate.semibold, fontSize: 56, lineHeight: 64, letterSpacing: 0 },
  /** A figure on a line of a list. */
  readout: { fontFamily: plate.semibold, fontSize: 26, lineHeight: 31 },
  /** Small condensed lettering under a figure. */
  unit: { fontFamily: plate.medium, fontSize: 14, lineHeight: 16, letterSpacing: 0.4 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  tabular,
} as const satisfies Record<string, TextStyle>;

/** Room for the tab bar under a scrolling tab screen. */
export const TAB_BAR_SPACE = Platform.select({ web: 96, default: 110 }) ?? 110;

export const HAIRLINE = Platform.select({ web: 1, default: 0.5 }) ?? 0.5;

/** Keeps a single short word from being left alone on the last line of a title. */
export const NO_ORPHAN = (Platform.OS === 'web' ? { textWrap: 'pretty' } : {}) as object;

/** Browsers draw a focus ring round a text field; the form's own layout already shows where you are. */
export const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

export type Tone = 'blue' | 'amber' | 'red' | 'muted';

export function toneColor(c: Colors, tone: Tone): string {
  return tone === 'red' ? c.red : tone === 'amber' ? c.amber : tone === 'blue' ? c.blue : c.ink3;
}
