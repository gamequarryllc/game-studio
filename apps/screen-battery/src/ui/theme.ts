import { StyleSheet } from 'react-native';

// One dark, plain look, so the colour of the battery is the only colour on
// the screen. There is no light version on purpose.

export const c = {
  ground: '#101214',
  card: '#1B1E22',
  raised: '#2A2D31',
  rule: '#2A2D31',
  ink: '#F2F3F1',
  ink2: '#D6D9DC',
  ink3: '#B4B9BE',
  outline: '#5A5F65',
  paper: '#F2F3F1',
  onPaper: '#10120F',
  onPaper2: '#3D423C',
} as const;

export const display = { bold: 'SpaceGrotesk_700Bold', semi: 'SpaceGrotesk_600SemiBold' } as const;

export const HAIRLINE = StyleSheet.hairlineWidth;
