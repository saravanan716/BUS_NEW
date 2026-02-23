/**
 * floatingInfoBox.ts — Lightweight floating info overlay manager
 *
 * ⚡ DESIGN RULES (Mobile-first, map-first):
 *   - ALL overlays use position:fixed — never push/reflow the map
 *   - Panels are transparent/semi-opaque — map always visible underneath
 *   - Minimum DOM footprint — no heavy shadows, no backdrop-filter on mobile
 *   - will-change:transform hints GPU compositing for smooth show/hide
 *   - Touch targets ≥ 44px (Apple HIG / WCAG minimum)
 *
 * ⚡ PER SPEC:
 *   - Route stops shown ONLY ON MAP (green pins, red dest pin)
 *   - Stop list does NOT appear in page layout
 *   - Floating info box is "very small, transparent, does not disturb the map"
 */

export interface BusInfo {
  name      : string;
  routeName : string;
  stops     : string[];
  speed     : number | string;
  distAway  : string;
  eta       : string;
}

export interface DistanceInfo {
  airKm  : string;
  roadKm : string;
  eta    : string;
  nextStop: string;
  toDest  : string;
  subLabel: string;
}

// ── Floating status pill ──────────────────────────────────────────────────────

let _pillEl: HTMLElement | null = null;
let _pillTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * showStatusPill — shows a small floating pill message at bottom of map.
 * Auto-hides after `autoDismissMs` (default 4000ms, 0 = never).
 *
 * ⚡ Uses a single reused element — no repeated createElement calls.
 */
export function showStatusPill(message: string, autoDismissMs = 4000): void {
  if (!_pillEl) {
    _pillEl = document.createElement('div');
    _pillEl.style.cssText = [
      'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:3000', 'background:rgba(26,34,54,.88)', 'color:#fff',
      'border-radius:50px', 'padding:9px 18px', 'font-size:12px',
      'font-weight:600', 'white-space:nowrap', 'max-width:90vw',
      'overflow:hidden', 'text-overflow:ellipsis',
      'pointer-events:none',         // ⚡ non-interactive = no hit-test overhead
      'will-change:opacity',          // ⚡ GPU compositing hint
      'transition:opacity .25s',
      'opacity:0',
    ].join(';');
    document.body.appendChild(_pillEl);
  }

  _pillEl.textContent = message;
  _pillEl.style.opacity = '1';

  if (_pillTimer) clearTimeout(_pillTimer);
  if (autoDismissMs > 0) {
    _pillTimer = setTimeout(() => { if (_pillEl) _pillEl.style.opacity = '0'; }, autoDismissMs);
  }
}

export function hideStatusPill(): void {
  if (_pillEl) _pillEl.style.opacity = '0';
  if (_pillTimer) { clearTimeout(_pillTimer); _pillTimer = null; }
}

// ── Bus info card ─────────────────────────────────────────────────────────────

/**
 * updateBusInfoCard — updates the floating bus info card content.
 * Card slides up from bottom; does NOT reflow the map.
 *
 * ⚡ Uses innerHTML batch update (single reflow per call).
 */
export function updateBusInfoCard(info: BusInfo): void {
  const card = document.getElementById('bus-info-card');
  if (!card) return;

  // ⚡ Only update text content elements — no structural DOM changes
  setTextSafe('bic-num',   info.name);
  setTextSafe('bic-name',  info.routeName);
  setTextSafe('bic-stops', `${info.stops.length} stops`);
  setTextSafe('ps-speed',  String(info.speed));
  setTextSafe('ps-dist',   info.distAway);
  setTextSafe('ps-eta',    info.eta);
}

export function showBusInfoCard(): void {
  document.getElementById('bus-info-card')?.classList.add('show');
}

export function hideBusInfoCard(): void {
  document.getElementById('bus-info-card')?.classList.remove('show');
}

// ── Distance panel ────────────────────────────────────────────────────────────

/**
 * updateDistancePanel — updates the compact bottom distance strip.
 *
 * ⚡ Batches all 5 text updates into a single function call.
 *    Caller should NOT call individual setTextContent per field —
 *    that triggers 5 separate style recalculations.
 */
export function updateDistancePanel(info: DistanceInfo): void {
  setTextSafe('pd-km',     info.airKm  + ' km');
  setTextSafe('pd-road',   info.roadKm + ' km');
  setTextSafe('pd-eta',    info.eta);
  setTextSafe('pd-nextstop', info.nextStop);
  setTextSafe('pd-todest', info.toDest + ' km');
  setTextSafe('pd-sub',    info.subLabel);
  setTextSafe('ps-eta',    info.eta);
  document.getElementById('pass-distance-panel')?.classList.add('show');
}

export function hideDistancePanel(): void {
  document.getElementById('pass-distance-panel')?.classList.remove('show');
}

// ── On-bus mode banner ────────────────────────────────────────────────────────

export function setOnBusMode(active: boolean, speed?: number | string): void {
  const banner = document.getElementById('on-bus-banner');
  if (!banner) return;
  if (active) {
    banner.classList.add('show');
    setTextSafe('on-bus-speed', String(speed ?? 0));
  } else {
    banner.classList.remove('show');
  }
}

// ── Driver toast ──────────────────────────────────────────────────────────────

let _toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * showDriverToast — brief bottom toast for driver notifications.
 * e.g., "Destination reached! Route reversed."
 */
export function showDriverToast(message: string, durationMs = 3500): void {
  const el = document.getElementById('drv-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), durationMs);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function setTextSafe(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text; // ⚡ Skip if unchanged
}

/**
 * buildStopListHTML — builds a stop list HTML string.
 * Returns a string for single innerHTML assignment (one reflow, not N).
 *
 * ⚡ Per spec: stop list is ONLY shown in driver panel (not on passenger map).
 *    Passenger stop info is conveyed via map pins, not DOM list.
 */
export function buildStopListHTML(stops: string[], highlightIndex = 0): string {
  const n = stops.length;
  return stops.map((s, i) => {
    const isFirst = i === 0, isLast = i === n - 1;
    const cls = `stop-item${i === highlightIndex ? ' current' : ''}`;
    return `<div class="${cls}">
      <div class="stop-num">${i + 1}</div>
      <div class="stop-info">
        <div class="stop-name">${escHtml(s)}</div>
        <div class="stop-dist">${isFirst ? 'Starting stop' : isLast ? 'Destination' : 'Via stop'}</div>
      </div>
      ${isFirst ? '<span class="stop-badge stop-start">START</span>' : ''}
      ${isLast  ? '<span class="stop-badge stop-end">END</span>'     : ''}
    </div>`;
  }).join('');
}

function escHtml(s: string): string {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
