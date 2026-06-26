// Display formatters for the mobile app.
//
// Lives in utils/ rather than a Vue file because both history/index and
// history/detail use the exact same logic — and any future page that
// renders GPS distance / ISO timestamps should reuse these instead of
// re-implementing them with drift.

/**
 * Render a meter distance as either "XX米" (<1000) or "X.X公里" (>=1000).
 * `null` / NaN render as "—" (no GPS fix on either side of the comparison).
 */
export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)}米`;
  const km = meters / 1000;
  return `${km.toFixed(1)}公里`;
}

/**
 * Render an ISO date-time string as compact local "YYYY-MM-DD HH:mm".
 * Falls back to the raw string when the input is unparseable (so the user
 * still sees *something* rather than "Invalid Date").
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}