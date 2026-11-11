import type { useRouter } from 'expo-router';

import { canAddItem } from '@/domain/limits';
import { pro } from '@/pro/pro';

import { store } from './store';

type Router = ReturnType<typeof useRouter>;

/** Opens the new-item form, or the Pro screen when the free version is full. */
export function openNewItem(router: Router, roomId?: string): void {
  if (!canAddItem(store.get(), pro.snapshot().isPro)) {
    router.push('/pro');
    return;
  }
  router.push(roomId ? { pathname: '/item-form', params: { roomId } } : '/item-form');
}
