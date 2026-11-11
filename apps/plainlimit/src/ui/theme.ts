import { StyleSheet } from 'react-native';

import { GROUND } from '@/domain/tone';

// One dark, plain ground, so the battery's colour is the only colour on the
// screen: it fills the top of Today, and marks what is chosen everywhere
// else. There is no light version on purpose.

export const c = {
  ground: GROUND,
  card: '#17191C',
  raised: '#24272B',
  rule: '#25282C',
  ink: '#F4F5F2',
  ink2: '#D6D9DC',
  ink3: '#A9AEB3',
  outline: '#5A5F65',
  paper: '#F4F5F2',
  onPaper: '#10120F',
  onPaper2: '#3D423C',
  /** Text on the day's colour, when that colour is light. */
  onTone: '#10120F',
} as const;

export const display = { bold: 'SpaceGrotesk_700Bold', semi: 'SpaceGrotesk_600SemiBold' } as const;

export const HAIRLINE = StyleSheet.hairlineWidth;
