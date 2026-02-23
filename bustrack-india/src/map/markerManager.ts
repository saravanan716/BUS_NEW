/**
 * markerManager.ts — Icon singletons, marker CRUD, bus rotation
 *
 * ⚡ Icons are created ONCE as module-level singletons.
 *    L.divIcon() parses an HTML string every call — expensive if called per update.
 *    Singletons eliminate that overhead entirely.
 */
import L from 'leaflet';

export type MarkerSet = { marker: L.Marker };

const _icons: Record<string, L.DivIcon> = {};

function icon(key: string, html: string, size: [number, number] = [32, 32]): L.DivIcon {
  if (!_icons[key]) {
    _icons[key] = L.divIcon({ html, className: '', iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
  }
  return _icons[key];
}

export const getBusIcon  = () => icon('bus',  '🚌', [36, 36]);
export const getPassIcon = () => icon('pass', '📍', [28, 28]);
export const getGreenStopIcon = () => icon('green', '<div style="width:14px;height:14px;background:#1e8e3e;border-radius:50%;border:2px solid #fff"></div>', [14, 14]);
export const getDestIcon = () => icon('dest', '<div style="width:16px;height:16px;background:#c5221f;border-radius:50%;border:2px solid #fff"></div>', [16, 16]);
export const getFromIcon = () => icon('from', '<div style="width:14px;height:14px;background:#1967d2;border-radius:50%;border:2px solid #fff"></div>', [14, 14]);

export function createNumberedStopIcon(n: number): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;background:#1e8e3e;color:#fff;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${n}</div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

export function updateOrCreateBusMarker(map: L.Map, existing: L.Marker | null, lat: number, lon: number): L.Marker {
  if (existing) { existing.setLatLng([lat, lon]); return existing; }
  return L.marker([lat, lon], { icon: getBusIcon() }).addTo(map);
}

export function rotateBusMarker(marker: L.Marker, bearing: number): void {
  const el = marker.getElement();
  if (el) el.style.transform += ` rotate(${bearing}deg)`;
}
