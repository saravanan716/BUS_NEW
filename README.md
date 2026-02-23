# 🚌 BusTrack India

<div align="center">

**Live bus tracking web app — mobile-first, performance-optimised, India-focused.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Ready-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Supabase Setup](#-supabase-setup) · [Edge Function](#-edge-function-optional) · [Performance](#-performance) · [Browser Support](#-browser-support)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📍 **Real-time GPS sharing** | Driver shares location; passengers see the bus move live on the map |
| 🗺️ **Full-screen map** | Map always fills the viewport; all UI floats over it without reflowing |
| 🛣️ **Route drawing** | OSRM road-snapped paths drawn once and permanently cached |
| 📌 **Colour-coded pins** | Green stop pins and red destination pin rendered on map only (not in page layout) |
| 🚌 **On-bus mode** | Passenger auto-detects they're on the bus; auto-centers view and shows live speed |
| ⚙️ **Admin panel** | Create, edit, and delete bus routes with geocoded stops |
| ☁️ **Supabase sync** | Routes and passwords synced across all devices via Supabase |
| 📶 **Offline fallback** | Fully functional on `localStorage` when Supabase is unavailable |

---

## 🚀 Quick Start

### Option 1 — No build (simplest)

Open `public/index.html` directly in a browser. The file is fully self-contained with no build step required.

```bash
# Serve locally to avoid file:// CORS issues with geolocation
npx serve public
# or
python3 -m http.server 3000 --directory public
```

Open **http://localhost:3000**

### Option 2 — TypeScript dev server

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Type check only
npm run typecheck

# Production build
npm run build
```

---

## 🗂️ Architecture

```
bustrack-india/
├── public/
│   └── index.html                      ← Single-file deployable (all CSS/JS inline)
├── src/
│   ├── main.ts                         ← App bootstrap, screen navigation, auth
│   ├── map/
│   │   ├── mapInit.ts                  ← Leaflet init with Canvas renderer
│   │   ├── routeRenderer.ts            ← Polyline drawing (draw once, cache, no duplicates)
│   │   ├── markerManager.ts            ← Icon singletons, marker CRUD, rotation
│   │   └── animationWorker.ts          ← requestAnimationFrame marker interpolation
│   ├── services/
│   │   ├── routeCache.ts               ← Two-tier OSRM cache (memory + sessionStorage)
│   │   ├── supabaseService.ts          ← Zero-dependency Supabase REST wrapper
│   │   └── geoValidator.ts             ← Nominatim geocoding with anchor + cache
│   ├── workers/
│   │   └── routeWorker.ts              ← Web Worker: geometry flip, bearings, haversine
│   └── ui/
│       ├── floatingInfoBox.ts          ← Floating overlay update helpers
│       └── mobileLayout.css            ← Mobile-first fixed-position overlay rules
├── styles/
│   └── global.css                      ← Design tokens, resets, animations
├── supabase/
│   └── functions/
│       └── route-resolver/
│           └── index.ts                ← Edge Function (optional server-side geocoding)
├── .gitignore
├── LICENSE
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Key Design Decisions

- **Lazy map init** — All three Leaflet maps initialise only when the user navigates to that screen, saving CPU and memory on load.
- **Canvas renderer** — Switched from SVG to Canvas (`preferCanvas: true`) for 10× faster rendering with 50+ markers.
- **Web Worker offload** — GeoJSON coordinate flips, bearing calculations, and haversine chains run in `routeWorker.ts` off the main thread to prevent dropped frames.
- **Singleton icons** — Bus/stop icons are created once and reused — no repeated DOM string parsing on every GPS update.
- **Route cache warm-up** — OSRM geometry is pre-fetched in the background the moment a driver selects a route, so sharing starts instantly.
- **Zero-dependency Supabase** — Direct REST calls via `fetch()` instead of the Supabase JS SDK (saves ~120KB gzipped).

---

## ☁️ Supabase Setup

Supabase enables routes and passwords to sync across all devices. This step is **optional** — the app works fully offline using `localStorage`.

### 1. Create a project at [supabase.com](https://supabase.com)

### 2. Run this SQL in the Supabase SQL Editor

```sql
-- Bus routes table
CREATE TABLE buses (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name        TEXT NOT NULL,
  stops       JSONB NOT NULL DEFAULT '[]',
  stop_coords JSONB,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Driver location table (single row, id = 1)
CREATE TABLE driver_location (
  id          BIGINT PRIMARY KEY,
  lat         FLOAT8,
  lon         FLOAT8,
  speed       FLOAT8 DEFAULT 0,
  heading     FLOAT8 DEFAULT 0,
  sharing     BOOLEAN DEFAULT FALSE,
  bus_name    TEXT DEFAULT '',
  route_stops JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO driver_location (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Settings table (admin / driver passwords)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Enable Row Level Security
ALTER TABLE buses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings        ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (adjust for your security requirements)
CREATE POLICY "Public access" ON buses           FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public access" ON driver_location FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public access" ON settings        FOR ALL USING (TRUE) WITH CHECK (TRUE);
```

### 3. Connect the app

1. Open the app → **Admin panel** → **Settings** tab
2. Enter your Supabase **Project URL** and **anon key**
3. Click **Save & Connect**

---

## 🌐 Edge Function (Optional)

Deploying the edge function moves Nominatim geocoding server-side, so passengers skip 5–15 API calls on first load. Results are cached in Deno KV for 24 hours.

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy the function
supabase functions deploy route-resolver --no-verify-jwt

# Set secrets
supabase secrets set SUPABASE_URL=<your-url> SUPABASE_SERVICE_ROLE_KEY=<your-key>
```

**How it works:** The function geocodes all stops server-side, fetches the OSRM route once, caches the result in Deno KV, and returns a single JSON payload to the client — eliminating per-passenger API round-trips entirely. If the function is unavailable, the client falls back to direct Nominatim + OSRM calls automatically.

---

## ⚡ Performance

| Metric | v3 (Before) | v4 (After) |
|---|---|---|
| Route draw time | ~5000 ms | **< 100 ms** (cached) |
| GPS update lag | 300–800 ms | **< 16 ms** (rAF) |
| Map renderer | SVG (slow for 50+ markers) | **Canvas** (10× faster) |
| OSRM calls per session | N (repeated) | **1** per unique route |
| Nominatim calls | N × passengers | **1** per stop (edge cached) |
| Mobile 60 fps | ❌ CSS filters caused drops | ✅ No filters, GPU hints |
| Route pins in page | ❌ Pushed map down | ✅ Pins only on map |

---

## 🗺️ Map Pin Reference

| Pin | Colour | Meaning |
|---|---|---|
| 🟢 Green | `#1e8e3e` | Intermediate route stops |
| 🔴 Red | `#c5221f` | Final destination |
| 🔵 Blue | `#1967d2` | Route polyline (outbound) |
| 🟠 Orange | `#e8820c` | Route polyline (return) |
| 🚌 Bus icon | Animated | Live bus position |

---

## 🔐 Default Passwords

> ⚠️ **Change these immediately** via Admin → Settings before deploying publicly.

| Role | Default |
|---|---|
| Driver | `driver123` |
| Admin | `admin456` |

---

## 🌐 Browser Support

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 14+ (iOS) | ✅ Full |
| Samsung Internet 14+ | ✅ Full |
| Opera Mini | ⚠️ Map only (no geolocation) |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.4 |
| Bundler | Vite 5.2 |
| Map | Leaflet 1.9 (Canvas renderer) |
| Routing | OSRM (open source) |
| Geocoding | Nominatim / OpenStreetMap |
| Backend | Supabase (Postgres + REST) |
| Edge | Supabase Edge Functions (Deno) |
| Styling | Vanilla CSS (design tokens) |

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and deploy.
