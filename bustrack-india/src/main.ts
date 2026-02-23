/**
 * main.ts — Application entry point
 *
 * ⚡ INITIALIZATION STRATEGY:
 *
 * 1. DOMContentLoaded fires before images/fonts load — fast first parse.
 * 2. Supabase auto-reconnect runs in background (non-blocking).
 * 3. Leaflet maps initialized LAZILY — only when user navigates to that screen.
 *    Initializing all 3 maps on page load wastes CPU and memory.
 * 4. Icons pre-created as singletons — no repeated DOM string parsing.
 * 5. Polling intervals use setInterval + immediate first call pattern.
 *    No "wait 3 seconds for first update".
 * 6. Route cache pre-warmed when driver selects a route — so by the
 *    time sharing starts, OSRM geometry is already cached.
 *
 * FILE ROLES:
 *  main.ts              ← App bootstrap, screen navigation, auth
 *  map/mapInit.ts       ← Map creation, tile layer
 *  map/routeRenderer.ts ← Polyline drawing with layer deduplication
 *  map/markerManager.ts ← Icon singletons, marker CRUD, rotation
 *  map/animationWorker.ts ← rAF marker interpolation
 *  services/supabaseService.ts ← Supabase REST wrapper
 *  services/routeCache.ts      ← Two-tier OSRM result cache
 *  services/geoValidator.ts    ← Nominatim geocoding with cache + anchor
 *  workers/routeWorker.ts      ← Web Worker for geometry processing
 *  ui/floatingInfoBox.ts       ← Floating overlay update functions
 *  ui/mobileLayout.css         ← Mobile-first layout rules
 *  styles/global.css           ← Design system tokens + resets
 */

// ── Imports (TypeScript — compiled to ES modules or bundled) ──────────────────
import { initMap, applyOSMTiles, invalidateSizeAsync } from './map/mapInit';
import { drawRoute, fetchAndDrawRoute, clearRouteLayer, ROUTE_COLORS, ROUTE_WEIGHTS } from './map/routeRenderer';
import { getBusIcon, getPassIcon, getGreenStopIcon, getDestIcon, getFromIcon, createNumberedStopIcon, MarkerSet, updateOrCreateBusMarker, rotateBusMarker } from './map/markerManager';
import { animateMarkerTo, smoothBusMove, cancelAnimation, addRouteArrows } from './map/animationWorker';
import { RouteCache } from './services/routeCache';
import { geocodeStop, geocodeStopSequence, prewarmCache } from './services/geoValidator';
import { configure as configureSb, testConnection, loadBuses, saveBus, deleteBus, saveDriverLocation, pollDriverLocation, clearDriverSharing, loadSettings, saveSetting } from './services/supabaseService';
import { showStatusPill, hideStatusPill, updateBusInfoCard, showBusInfoCard, hideBusInfoCard, updateDistancePanel, hideDistancePanel, setOnBusMode, showDriverToast, buildStopListHTML } from './ui/floatingInfoBox';

// ── Type declarations ─────────────────────────────────────────────────────────

interface RouteStop { name: string; lat?: number; lon?: number }
interface SavedBus  { id: number; name: string; stops: string[]; stopCoords?: Array<{lat:number;lon:number}|null>|null; addedAt: string }
interface DriverLoc { lat:number; lon:number; speed:number; heading:number; sharing:boolean; busName:string; routeStops:string[]; ts:number }
interface AppState {
  // Driver
  driverMap     : any;
  driverMarker  : any;
  driverRoute   : { layer:any|null; shadow:any|null };
  driverDest    : any;
  driverWatchId : number | null;
  driverLat     : number | null;
  driverLon     : number | null;
  driverPrevLat : number | null;
  driverPrevLon : number | null;
  routeStops    : RouteStop[];
  routeReversed : boolean;
  stopMarkers   : any[];
  updateCount   : number;
  lastRouteKey  : string | null;
  routeDrawPending: boolean;
  // Passenger
  passMap       : any;
  busMarker     : any;
  passLocMarker : any;
  passDestMarker: any;
  passRoute     : { layer:any|null; shadow:any|null };
  passStopMarkers: any[];
  busLineOnMap  : any;
  passLat       : number | null;
  passLon       : number | null;
  passDestLat   : number | null;
  passDestLon   : number | null;
  passMode      : string;
  isAutoCenter  : boolean;
  selectedBus   : SavedBus | null;
  prevBusLat    : number | null;
  prevBusLon    : number | null;
  prevBusTime   : number | null;
  lastShownRouteKey: string | null;
  lastPassDrawKey  : string | null;
  passRouteInFlight: boolean;
  passPollTimer    : ReturnType<typeof setInterval> | null;
}

// ── Local storage keys ────────────────────────────────────────────────────────
const K = {
  DRIVER   : 'bt_driver_loc',
  BUSES    : 'bt_buses',
  DRV_PW   : 'bt_drv_pw',
  ADMIN_PW : 'bt_admin_pw',
  DRV_ROUTE: 'bt_driver_route',
  SB_URL   : 'bt_sb_url',
  SB_KEY   : 'bt_sb_key',
} as const;

// ── App state singleton ───────────────────────────────────────────────────────
const state: AppState = {
  driverMap: null, driverMarker: null,
  driverRoute: { layer: null, shadow: null },
  driverDest: null, driverWatchId: null,
  driverLat: null, driverLon: null, driverPrevLat: null, driverPrevLon: null,
  routeStops: [], routeReversed: false, stopMarkers: [],
  updateCount: 0, lastRouteKey: null, routeDrawPending: false,

  passMap: null, busMarker: null, passLocMarker: null, passDestMarker: null,
  passRoute: { layer: null, shadow: null }, passStopMarkers: [], busLineOnMap: null,
  passLat: null, passLon: null, passDestLat: null, passDestLon: null,
  passMode: 'bus', isAutoCenter: false, selectedBus: null,
  prevBusLat: null, prevBusLon: null, prevBusTime: null,
  lastShownRouteKey: null, lastPassDrawKey: null,
  passRouteInFlight: false, passPollTimer: null,
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // ⚡ Auto-reconnect Supabase in background (non-blocking)
  const sbUrl = localStorage.getItem(K.SB_URL);
  const sbKey = localStorage.getItem(K.SB_KEY);

  if (sbUrl && sbKey) {
    configureSb({ url: sbUrl, anonKey: sbKey });
    setSbStatus('syncing', '⏳ Reconnecting…');
    const ok = await testConnection();
    if (ok) {
      setSbStatus('connected', '✅ Supabase connected');
      await Promise.all([syncBuses(), syncSettings()]);
    } else {
      setSbStatus('disconnected', '⚠️ Could not reconnect to Supabase');
    }
  } else {
    setSbStatus('disconnected', '⚠️ Supabase not configured');
  }

  // Attach keyboard enter handlers
  document.getElementById('drv-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') (window as any).doDriverLogin(); });
  document.getElementById('admin-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') (window as any).doAdminLogin(); });
});

// ── Helper: local storage ─────────────────────────────────────────────────────

function getSavedBuses(): SavedBus[] {
  try { return JSON.parse(localStorage.getItem(K.BUSES) || '[]'); } catch { return []; }
}

function saveBuses(buses: SavedBus[]): void {
  localStorage.setItem(K.BUSES, JSON.stringify(buses));
}

function getDriverLoc(): DriverLoc | null {
  try { return JSON.parse(localStorage.getItem(K.DRIVER) || 'null'); } catch { return null; }
}

function setSbStatus(state: string, msg: string): void {
  const bar  = document.getElementById('sb-status-bar');
  const text = document.getElementById('sb-status-text');
  if (!bar || !text) return;
  bar.className   = `sb-status-bar ${state}`;
  text.textContent = msg;
}

// ── Supabase sync ─────────────────────────────────────────────────────────────

async function syncBuses(): Promise<void> {
  const rows = await loadBuses();
  if (rows.length > 0) {
    const buses: SavedBus[] = rows.map(r => ({
      id        : r.id,
      name      : r.name,
      stops     : r.stops,
      stopCoords: r.stop_coords ?? null,
      addedAt   : r.added_at,
    }));
    saveBuses(buses);
    setSbStatus('connected', `✅ Supabase — ${buses.length} route(s) loaded`);
  }
}

async function syncSettings(): Promise<void> {
  const settings = await loadSettings();
  if (settings['admin_pw'])  localStorage.setItem(K.ADMIN_PW, settings['admin_pw']);
  if (settings['driver_pw']) localStorage.setItem(K.DRV_PW,   settings['driver_pw']);
}

// ── Route cache warming (called when driver selects route) ────────────────────

async function warmRouteCache(stops: RouteStop[]): Promise<void> {
  const resolved = stops.filter(s => s.lat && s.lon) as Array<{lat:number;lon:number}>;
  if (resolved.length >= 2) {
    // Pre-fetch OSRM in background — will be instantly available when sharing starts
    RouteCache.prewarm(resolved, 'driving').catch(() => {});
  }
}

// Export key functions to window for HTML onclick handlers
// (In production, use event listeners or a module bundler like Vite/esbuild)
Object.assign(window, {
  // Navigation
  showScreen: (id: string) => {
    document.querySelectorAll('.screen').forEach((s: Element) => (s as HTMLElement).classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  },

  // Expose state for debugging
  __busTrackState: state,
  __busTrackCache: RouteCache,
});

// Export types for use in other modules
export type { RouteStop, SavedBus, DriverLoc, AppState };
export { state, K, getSavedBuses, saveBuses, getDriverLoc, setSbStatus, syncBuses, syncSettings, warmRouteCache };
