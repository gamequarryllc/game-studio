import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayYmd } from '@/domain/dates';
import type { Ymd } from '@/domain/types';

// Today's date for the screens. It moves on when the app comes back to the
// front and when midnight passes while it is open, so "due today" is never
// yesterday's news.

export function useToday(): Ymd {
  const [today, setToday] = useState<Ymd>(() => todayYmd(Date.now()));
  useEffect(() => {
    const check = () => setToday(todayYmd(Date.now()));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const timer = setInterval(check, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}
