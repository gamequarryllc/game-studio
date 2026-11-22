import { useState } from 'react';

import { typingOf, type Sum } from '@/domain/puzzle';
import { warning } from '@/platform/haptics';

/**
 * The typing for one sum, shared by the two screens that ask for sums. The
 * answer goes through by itself the moment it is right, and a miss as long as
 * the answer is said at once and cleared, so nobody has to find a button: on a
 * number pad the phone has no return key, and the Done button it used to add
 * sat on top of the screen's own button (the owner, 2026-11-22).
 *
 * `keepAnswer` leaves the right answer in the field (while the apps open);
 * without it the field empties for the next sum.
 */
export function useSumEntry(sum: Sum, onRight: () => void, keepAnswer = false) {
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState<string | null>(null);

  const miss = (text: string) => {
    warning();
    setWrong(text);
    setTyped('');
  };

  return {
    typed,
    /** The answer that was just turned down, until typing starts again. */
    wrong,
    type(text: string) {
      const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
      const verdict = typingOf(sum, digits);
      if (verdict === 'wrong') return miss(digits);
      setTyped(verdict === 'right' && !keepAnswer ? '' : digits);
      setWrong(null);
      if (verdict === 'right') onRight();
    },
    /** The screen's own button, or a keyboard's return key. */
    submit() {
      if (typed === '') return;
      if (typingOf(sum, typed) !== 'right') return miss(typed);
      if (!keepAnswer) setTyped('');
      onRight();
    },
  };
}
