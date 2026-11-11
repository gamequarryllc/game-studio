import type { Id } from './types';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * A short random id. Collisions only matter inside one phone's document, so
 * 16 characters of 5 bits each is far more than enough.
 */
export function newId(random: () => number = Math.random): Id {
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  return out;
}

const ID_RX = /^[0-9a-z_-]{4,40}$/;

/** Ids end up in file names, so anything that isn't a plain token is refused. */
export function isSafeId(value: unknown): value is Id {
  return typeof value === 'string' && ID_RX.test(value);
}
