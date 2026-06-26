// Geographic helpers — pure functions, no I/O.
//
// Currently exports only `haversineDistance`. Earth radius is the IUGG mean
// radius (6371 km). Returned distances are in meters.

const EARTH_RADIUS_METERS = 6371000;

/** Convert decimal degrees to radians. Internal helper. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng pairs using the Haversine formula.
 *
 * Returns NaN when ANY of the four inputs is non-finite (NaN, ±Infinity) or
 * when a latitude is outside [-90, 90] or a longitude outside [-180, 180].
 * Callers can use `Number.isNaN(result)` to detect "bad input" — the
 * distinction matters for the GPS-verification flow, which treats "unknown
 * distance" (e.g. customer not yet geocoded) and "computed distance" differently.
 *
 * @param lat1 Latitude of point 1, in decimal degrees.
 * @param lng1 Longitude of point 1, in decimal degrees.
 * @param lat2 Latitude of point 2, in decimal degrees.
 * @param lng2 Longitude of point 2, in decimal degrees.
 * @returns Distance in meters, or NaN on invalid input.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return NaN;
  }
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return NaN;
  if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) return NaN;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dPhi = toRadians(lat2 - lat1);
  const dLambda = toRadians(lng2 - lng1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}
