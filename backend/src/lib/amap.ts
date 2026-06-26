// AMap (高德地图) geocoding helper.
//
// Wraps the v3 REST endpoint `https://restapi.amap.com/v3/geocode/geo` with:
//   1. An LRU cache (Map, max 1000 entries) keyed by exact address — repeated
//      imports of the same address never re-hit the upstream API.
//   2. A clear `null` return when the key is missing, the API rejects, or the
//      response shape is unexpected. Callers can treat `null` as "no coords".
//
// LRU implementation: insertion-ordered Map + a re-insert on hit to move the
// key to the back (most-recently-used). When the cache overflows we drop the
// oldest (head) entry.
//
// `address` must be the raw input from the caller — we encodeURIComponent it
// once before issuing the fetch. We never trust caller-encoded strings.

import { config } from '../config/index.js';

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

// Minimal shape of the AMap response we care about. We don't depend on the
// full OpenAPI schema — only the few fields we actually read.
interface AMapGeocodeResponse {
  readonly status?: string;
  readonly info?: string;
  readonly geocodes?: ReadonlyArray<{
    readonly location?: string; // "lng,lat"
  }>;
}

// ─── LRU cache ──────────────────────────────────────────────────────────────
const MAX_CACHE_SIZE = 1000;
const cache = new Map<string, GeoPoint | null>();

function cacheGet(key: string): GeoPoint | null | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  // Re-insert to mark as most-recently-used. JS Maps preserve insertion order,
  // so deleting then re-setting moves the entry to the tail.
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key: string, value: GeoPoint | null): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  // Evict the oldest entry if we overflowed.
  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Test-only hook — clear the in-process cache. Not used in production. */
export function _resetAmapCacheForTests(): void {
  cache.clear();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a free-form address to {lat, lng}.
 *
 * Returns null when:
 *   - AMAP_KEY is not configured
 *   - the upstream call throws / returns non-JSON / has status !== "1"
 *   - the geocodes array is empty or has no `location`
 *
 * Successful responses are memoized in-process. Two callers asking for the
 * same address back-to-back only hit the upstream once.
 */
export async function geocode(address: string): Promise<GeoPoint | null> {
  const trimmed = address.trim();
  if (trimmed === '') return null;

  const cached = cacheGet(trimmed);
  if (cached !== undefined) return cached;

  const key = config.amapKey;
  if (key === '') {
    // No key — cache the null so we don't retry on every call.
    cacheSet(trimmed, null);
    return null;
  }

  const url =
    `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(trimmed)}` +
    `&key=${encodeURIComponent(key)}&output=JSON`;

  let parsed: AMapGeocodeResponse | null = null;
  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      cacheSet(trimmed, null);
      return null;
    }
    parsed = (await resp.json()) as AMapGeocodeResponse;
  } catch {
    cacheSet(trimmed, null);
    return null;
  }

  if (parsed === null || parsed.status !== '1' || parsed.geocodes === undefined) {
    cacheSet(trimmed, null);
    return null;
  }
  const first = parsed.geocodes[0];
  if (first === undefined || typeof first.location !== 'string') {
    cacheSet(trimmed, null);
    return null;
  }

  // AMap returns "lng,lat" — string parse, then numeric coerce.
  const parts = first.location.split(',');
  if (parts.length !== 2) {
    cacheSet(trimmed, null);
    return null;
  }
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    cacheSet(trimmed, null);
    return null;
  }

  const point: GeoPoint = { lat, lng };
  cacheSet(trimmed, point);
  return point;
}