import type { useRouter } from 'expo-router';

import { canAddPlace } from '@/domain/limits';
import { pro } from '@/pro/pro';

import { store } from './store';

type Router = ReturnType<typeof useRouter>;

/** True when one more place fits; otherwise opens the Pro screen and says false. */
export function roomForPlace(router: Router): boolean {
  if (canAddPlace(store.get().places.length, pro.snapshot().isPro)) return true;
  router.push({ pathname: '/pro', params: { why: 'places' } });
  return false;
}

export function goBack(router: Router, fallback: '/' | '/places' | '/settings' = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
