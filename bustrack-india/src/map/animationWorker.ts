/**
 * animationWorker.ts — requestAnimationFrame marker interpolation
 *
 * ⚡ GPS updates arrive every ~3s. Without interpolation, the bus marker
 *    jumps. rAF interpolation smooths movement to 60fps between GPS fixes.
 */
import L from 'leaflet';

const _animations = new Map<string, number>();

export function animateMarkerTo(
  marker: L.Marker,
  toLat: number,
  toLon: number,
  durationMs = 2800,
  id = 'bus'
): void {
  cancelAnimation(id);
  const from = marker.getLatLng();
  const start = performance.now();

  function step(now: number) {
    const t = Math.min((now - start) / durationMs, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    marker.setLatLng([from.lat + (toLat - from.lat) * ease, from.lng + (toLon - from.lng) * ease]);
    if (t < 1) _animations.set(id, requestAnimationFrame(step));
  }

  _animations.set(id, requestAnimationFrame(step));
}

export const smoothBusMove = animateMarkerTo;

export function cancelAnimation(id = 'bus'): void {
  const rafId = _animations.get(id);
  if (rafId !== undefined) { cancelAnimationFrame(rafId); _animations.delete(id); }
}

export function addRouteArrows(map: L.Map, bearings: Array<{ lat: number; lon: number; bearing: number }>): L.Marker[] {
  return bearings.map(b =>
    L.marker([b.lat, b.lon], {
      icon: L.divIcon({
        html: `<div style="transform:rotate(${b.bearing}deg);font-size:16px;color:#1967d2">▲</div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      }),
    }).addTo(map)
  );
}
