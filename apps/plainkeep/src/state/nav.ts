import type { useRouter } from 'expo-router';

import { canAddThing } from '@/domain/limits';
import { pro } from '@/pro/pro';

import { store } from './store';

type Router = ReturnType<typeof useRouter>;

/** Opens the form for a new thing, or the Pro screen when the free version is full. */
export function openNewThing(router: Router, kind?: 'home' | 'vehicle' | 'other'): void {
  if (!canAddThing(store.get().things.length, pro.snapshot().isPro)) {
    router.push('/pro');
    return;
  }
  router.push(kind ? { pathname: '/thing-form', params: { kind } } : '/thing-form');
}

export function goBack(router: Router, fallback: '/' | '/things' | '/log' = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
