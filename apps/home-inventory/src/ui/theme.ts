import { Platform, useColorScheme, type TextStyle } from 'react-native';

// Roomfile's look: a household file kept in a drawer. Warm paper, a manila
// folder, ledger green ink, and a bookish serif for the numbers that matter.
// The art direction notes are in NOTES.md.

export interface Colors {
  /** The page behind everything. */
  paper: string;
  /** Raised surfaces: lists, forms. */
  card: string;
  /** Wells: inputs, chips, photo placeholders. */
  sunk: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  /** Ledger green: actions and the figures that add up. */
  green: string;
  onGreen: string;
  greenSoft: string;
  /** The manila folder. */
  manila: string;
  manilaEdge: string;
  manilaInk: string;
  manilaInk2: string;
  /** Gaps worth filling in. */
  amber: string;
  amberSoft: string;
  red: string;
  scrim: string;
  bar: string;
}

export const LIGHT: Colors = {
  paper: '#F5F1E8',
  card: '#FFFFFF',
  sunk: '#ECE7DB',
  ink: '#1C1B18',
  ink2: '#65615A',
  ink3: '#9C978C',
  rule: '#E2DCCE',
  green: '#1E5B48',
  onGreen: '#FFFFFF',
  greenSoft: '#DFEBE5',
  manila: '#EDDCB1',
  manilaEdge: '#D9C48B',
  manilaInk: '#33290F',
  manilaInk2: '#6E5F36',
  amber: '#9A5B13',
  amberSoft: '#F5E6CC',
  red: '#B3261E',
  scrim: 'rgba(28,27,24,0.40)',
  bar: 'rgba(250,248,243,0.96)',
};

export const DARK: Colors = {
  paper: '#121110',
  card: '#1D1B18',
  sunk: '#292622',
  ink: '#F1EDE4',
  ink2: '#A9A397',
  ink3: '#746F65',
  rule: '#302D28',
  green: '#74C7A7',
  onGreen: '#0E2A21',
  greenSoft: '#1B2C25',
  manila: '#3B3220',
  manilaEdge: '#51462B',
  manilaInk: '#F3E6C4',
  manilaInk2: '#BFAF85',
  amber: '#E3A85C',
  amberSoft: '#33281A',
  red: '#F2685E',
  scrim: 'rgba(0,0,0,0.58)',
  bar: 'rgba(24,22,20,0.96)',
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
export const radius = { s: 8, m: 12, l: 16 } as const;

/** Newsreader, loaded in the root layout. Used for titles and totals only. */
export const display = { medium: 'Newsreader_500Medium', semibold: 'Newsreader_600SemiBold' } as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** Sizes follow the iOS text styles so Dynamic Type scales them as people expect. */
export const type = {
  largeTitle: { fontFamily: display.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: display.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
  figure: { fontFamily: display.medium, fontSize: 44, lineHeight: 50, letterSpacing: -0.8 },
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

/** Browsers draw a focus ring round a text field; the form's own layout already shows where you are. */
export const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;
