/**
 * routeRenderer.ts — Polyline drawing with layer deduplication
 *
 * ⚡ Draw once, cache permanently. Never draw the same route twice.
 *    Caller checks lastRouteKey before calling fetchAndDrawRoute.
 */
import L from 'leaflet';

export const ROUTE_COLORS = { outbound: '#1967d2', return: '#e8820c' } as const;
export const ROUTE_WEIGHTS = { main: 5, shadow: 8 } as const;

export function drawRoute(
  map: L.Map,
  points: [number, number][],
  color = ROUTE_COLORS.outbound
): { layer: L.Polyline; shadow: L.Polyline } {
  const shadow = L.polyline(points, { color: '#000', weight: ROUTE_WEIGHTS.shadow, opacity: 0.08 }).addTo(map);
  const layer  = L.polyline(points, { color, weight: ROUTE_WEIGHTS.main, opacity: 0.85 }).addTo(map);
  return { layer, shadow };
}

export async function fetchAndDrawRoute(
  map: L.Map,
  stops: Array<{ lat: number; lon: number }>,
  color?: string
): Promise<{ layer: L.Polyline; shadow: L.Polyline } | null> {
  const coords = stops.map(s => `${s.lon},${s.lat}`).join(';');
  const url    = `/osrm/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const resp   = await fetch(url);
  const data   = await resp.json();
  if (!data?.routes?.length) return null;
  const points: [number, number][] = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
  return drawRoute(map, points, color);
}

export function clearRouteLayer(map: L.Map, route: { layer: L.Layer | null; shadow: L.Layer | null }): void {
  if (route.layer)  map.removeLayer(route.layer);
  if (route.shadow) map.removeLayer(route.shadow);
  route.layer  = null;
  route.shadow = null;
}
