/**
 * mapInit.ts — Leaflet map initialisation with Canvas renderer
 *
 * ⚡ Canvas renderer is 10× faster than SVG for 50+ markers.
 *    Pass { preferCanvas: true } to L.map() — single flag, huge win.
 */
import L from 'leaflet';

export function initMap(containerId: string): L.Map {
  return L.map(containerId, {
    preferCanvas: true,   // ⚡ Canvas renderer
    zoomControl: true,
    attributionControl: true,
  });
}

export function applyOSMTiles(map: L.Map): void {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

export async function invalidateSizeAsync(map: L.Map): Promise<void> {
  await new Promise(r => setTimeout(r, 100));
  map.invalidateSize();
}
