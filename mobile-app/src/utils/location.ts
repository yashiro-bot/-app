/**
 * GPS location utility for the mobile app.
 *
 * Primary path: `uni.getLocation` (works on H5 via browser Geolocation API,
 * and on the native App via the platform geo module declared in
 * `manifest.json` → `app-plus.modules.Geolocation`).
 *
 * Fallback path: if `uni.getLocation` throws (e.g. older H5 hosts that
 * don't bridge it), call the browser's `navigator.geolocation` directly.
 *
 * Coordinate system: `gcj02` (Mars coordinates), which matches the Amap
 * backend's geocoding output — server-side Haversine verification
 * (`distanceToCustomerM`) is therefore computed in the same frame as the
 * customer's stored lat/lng.
 */

export interface LocationResult {
  latitude: number;
  longitude: number;
  /** Position accuracy in meters. May be derived from `horizontalAccuracy`
   *  on platforms that report it separately (iOS), otherwise the generic
   *  `accuracy` field. */
  accuracy: number;
  /** Horizontal-only accuracy in meters when the platform distinguishes
   *  it from vertical. Optional because not every implementation reports it. */
  horizontalAccuracy?: number;
  /** Unix epoch ms when the fix was taken. */
  timestamp: number;
}

/**
 * Request a single GPS fix from the device.
 *
 * Resolves with a normalized `LocationResult`. Rejects with an `Error`
 * whose `.message` is suitable to show to end-users (permission denied,
 * timeout, GPS unavailable, etc.). Callers MUST handle the rejection —
 * the page-level catch in `pages/collect/index.vue` is the reference.
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  // Try uni.getLocation first (works on APP and H5).
  try {
    const res = await new Promise<UniApp.GetLocationSuccess>((resolve, reject) => {
      uni.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        highAccuracyExpireTime: 3000,
        success: resolve,
        fail: (err) => reject(new Error(err.errMsg || 'GPS failed')),
      });
    });
    return {
      latitude: res.latitude,
      longitude: res.longitude,
      accuracy: res.accuracy,
      horizontalAccuracy: res.horizontalAccuracy,
      // `UniApp.GetLocationSuccess` does not carry a fix timestamp;
      // we record the moment the wrapper received the value.
      timestamp: Date.now(),
    };
  } catch (e) {
    // H5 fallback: some browser hosts don't bridge uni.getLocation to
    // navigator.geolocation properly. Use the standard browser API.
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise<LocationResult>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              horizontalAccuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            }),
          (err) => reject(new Error(err.message || 'GPS failed')),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      });
    }
    throw e instanceof Error ? e : new Error('GPS failed');
  }
}

/**
 * Format an accuracy (meters) into a Chinese-language badge label.
 *
 * Buckets:
 *   < 30 m   → "高精度"  (good for verification — well under the 100 m radius)
 *   < 100 m  → "中等"    (within verification tolerance, lower confidence)
 *   >= 100 m → "低精度"  (cannot be verified against the customer coords)
 */
export function formatAccuracy(accuracy: number): string {
  if (accuracy < 30) return `${Math.round(accuracy)}m (高精度)`;
  if (accuracy < 100) return `${Math.round(accuracy)}m (中等)`;
  return `${Math.round(accuracy)}m (低精度)`;
}

/** Map an accuracy in meters to a discrete level for badge color-coding. */
export function accuracyLevel(accuracy: number): 'good' | 'medium' | 'poor' {
  if (accuracy < 30) return 'good';
  if (accuracy < 100) return 'medium';
  return 'poor';
}