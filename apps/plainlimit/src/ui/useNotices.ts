import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { notifyState, type NotifyAnswer } from '@/platform/notices';

/**
 * Whether notifications are allowed: read as the screen opens, and again
 * whenever the app comes back to the front (from the iPhone's Settings, say).
 * 'unasked' until the first reading is in. The setter is for a screen that
 * has just asked and knows the answer.
 */
export function useNotices(): [NotifyAnswer, (answer: NotifyAnswer) => void] {
  const [answer, setAnswer] = useState<NotifyAnswer>('unasked');
  useEffect(() => {
    let live = true;
    const read = () => void notifyState().then((now) => (live ? setAnswer(now) : undefined));
    read();
    const watch = AppState.addEventListener('change', (state) => (state === 'active' ? read() : undefined));
    return () => {
      live = false;
      watch.remove();
    };
  }, []);
  return [answer, setAnswer];
}
