import { Platform } from 'react-native';

/**
 * Preview only: the words after "?mock=" in the address, which stand in for
 * what only an iPhone can report (screenTime.ts lists them). Always empty on
 * a phone.
 */
export const MOCK: ReadonlySet<string> = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return new Set<string>();
  try {
    return new Set((new URLSearchParams(window.location.search).get('mock') ?? '').split(',').filter(Boolean));
  } catch {
    return new Set<string>();
  }
})();
