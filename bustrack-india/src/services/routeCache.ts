/**
 * routeCache.ts — Two-tier OSRM result cache (memory + sessionStorage)
 *
 * ⚡ Tier 1: In-memory Map — zero-latency lookup, lost on page reload.
 * ⚡ Tier 2: sessionStorage — survives page reload, cleared on tab close.
 *
 * Key format: "route:<lon1,lat1>;<lon2,lat2>;..."
 * This ensures the same stop sequence always hits the same cache entry.
 */

interface CachedRoute {
  points: [number, number][];
  distanceKm: number;
  cachedAt: number;
}

const _mem = new Map<string, CachedRoute>();
const PREFIX = 'btrc_';

function makeKey(stops: Array<{ lat: number; lon: number }>, profile: string): string {
  return `${profile}:` + stops.map(s => `${s.lon.toFixed(5)},${s.lat.toFixed(5)}`).join(';');
}

export const RouteCache = {
  get(stops: Array<{ lat: number; lon: number }>, profile = 'driving'): CachedRoute | null {
    const key = makeKey(stops, profile);
    if (_mem.has(key)) return _mem.get(key)!;
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw) { const v = JSON.parse(raw); _mem.set(key, v); return v; }
    } catch { /* ignore */ }
    return null;
  },

  set(stops: Array<{ lat: number; lon: number }>, data: Omit<CachedRoute, 'cachedAt'>, profile = 'driving'): void {
    const key = makeKey(stops, profile);
    const entry: CachedRoute = { ...data, cachedAt: Date.now() };
    _mem.set(key, entry);
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* quota exceeded */ }
  },

  async prewarm(stops: Array<{ lat: number; lon: number }>, profile = 'driving'): Promise<void> {
    if (this.get(stops, profile)) return; // already cached
    const coords = stops.map(s => `${s.lon},${s.lat}`).join(';');
    const resp = await fetch(`/osrm/route/v1/${profile}/${coords}?overview=full&geometries=geojson`);
    const data = await resp.json();
    if (!data?.routes?.length) return;
    const points: [number, number][] = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
    this.set(stops, { points, distanceKm: data.routes[0].distance / 1000 }, profile);
  },
};
