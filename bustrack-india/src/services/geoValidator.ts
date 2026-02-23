/**
 * geoValidator.ts — Nominatim geocoding with anchor heuristic + in-memory cache
 *
 * ⚡ Anchor heuristic: once the first stop is geocoded, subsequent stops
 *    pick the Nominatim result nearest to the anchor. This dramatically
 *    reduces false positives for common Indian town names.
 *
 * ⚡ In-memory cache: same stop name within a session never hits Nominatim twice.
 */

const _cache = new Map<string, { lat: number; lon: number; corrected: string } | null>();

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, d = (v: number) => v * Math.PI / 180;
  const a = Math.sin(d(lat2 - lat1) / 2) ** 2 + Math.cos(d(lat1)) * Math.cos(d(lat2)) * Math.sin(d(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeStop(
  name: string,
  anchor?: { lat: number; lon: number }
): Promise<{ lat: number; lon: number; corrected: string } | null> {
  const cacheKey = name.trim().toLowerCase();
  if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;

  const queries = [
    `${name} bus stand Tamil Nadu India`,
    `${name} bus stand India`,
    `${name} India`,
  ];

  for (const q of queries) {
    await new Promise(r => setTimeout(r, 250)); // Nominatim rate limit
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&countrycodes=in&namedetails=1&limit=3`;
    const results: any[] = await fetch(url, { headers: { 'User-Agent': 'BusTrackIndia/4.0' } }).then(r => r.json()).catch(() => []);
    if (!results.length) continue;

    let best = results[0];
    if (anchor && results.length > 1) {
      best = results.reduce((a: any, b: any) =>
        haversine(anchor.lat, anchor.lon, +a.lat, +a.lon) <= haversine(anchor.lat, anchor.lon, +b.lat, +b.lon) ? a : b
      );
    }

    const nd        = best.namedetails || {};
    const corrected = nd['name'] || nd['name:en'] || best.display_name.split(',')[0].trim();
    const result    = { lat: +best.lat, lon: +best.lon, corrected };
    _cache.set(cacheKey, result);
    return result;
  }

  _cache.set(cacheKey, null);
  return null;
}

export async function geocodeStopSequence(names: string[]): Promise<Array<{ lat: number; lon: number; corrected: string } | null>> {
  const results: Array<{ lat: number; lon: number; corrected: string } | null> = [];
  let anchor: { lat: number; lon: number } | undefined;

  for (const name of names) {
    const r = await geocodeStop(name, anchor);
    results.push(r);
    if (r && !anchor) anchor = r;
  }

  return results;
}

export async function prewarmCache(names: string[]): Promise<void> {
  await geocodeStopSequence(names);
}
