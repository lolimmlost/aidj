/**
 * Navidrome 0.64 re-encoded every id (navidrome#5824, migration `uniform_canonical_ids`): a 22-char id is now always
 * the base62 of a 128-bit value. Ids that already fit kept their value; random nanoids above 2^128 (most media file
 * and playlist ids from before) became the base62 of the MD5 of the old id string. Anything AIDJ stored or a browser
 * cached from before the upgrade (queues, Lab sets, the featured mix) carries the old form, which Navidrome no longer
 * knows. `canonicalNavidromeId` maps it to the id Navidrome uses now, exactly as the migration did; new ids, and
 * anything that isn't a 22-char base62 id, come back unchanged.
 */
import { md5Pure } from './md5';

/** Go's big.Int base-62 digits, which Navidrome encodes with */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LIMIT = 1n << 128n;

function decode(s: string): bigint | null {
  let v = 0n;
  for (const c of s) {
    const d = DIGITS.indexOf(c);
    if (d < 0) return null;
    v = v * 62n + BigInt(d);
  }
  return v;
}

function encode(v: bigint): string {
  let out = '';
  while (v > 0n) {
    out = DIGITS[Number(v % 62n)] + out;
    v /= 62n;
  }
  return out.padStart(22, '0');
}

export function canonicalNavidromeId(id: string): string;
export function canonicalNavidromeId(id: string | null | undefined): string | null | undefined;
export function canonicalNavidromeId(id: string | null | undefined) {
  if (typeof id !== 'string' || id.length !== 22) return id;
  const v = decode(id);
  if (v === null || v < LIMIT) return id;
  return encode(BigInt(`0x${md5Pure(id)}`));
}

/** Query params that carry Navidrome ids (Subsonic `id`, `songId`, `playlistId`, `songIdToAdd`, ...) */
const ID_PARAM = /^(id|[a-z]*Id|songIdToAdd)$/;

/** Rewrite every id-carrying query param in place; returns the same URLSearchParams. */
export function canonicalizeIdParams(params: URLSearchParams): URLSearchParams {
  for (const key of new Set(params.keys())) {
    if (!ID_PARAM.test(key)) continue;
    const values = params.getAll(key);
    const fixed = values.map((v) => canonicalNavidromeId(v));
    if (fixed.some((v, i) => v !== values[i])) {
      params.delete(key);
      for (const v of fixed) params.append(key, v);
    }
  }
  return params;
}
