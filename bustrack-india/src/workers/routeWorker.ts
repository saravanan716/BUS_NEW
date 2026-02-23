/**
 * routeWorker.ts — Web Worker for CPU-heavy route processing
 * (Deployed as a dedicated file; loaded via new Worker('routeWorker.js'))
 *
 * ⚡ Offloads to background thread:
 *   1. GeoJSON coordinate transformation (lon,lat → [lat,lon])
 *   2. Bearing calculation for direction arrows
 *   3. Haversine chain distance along polylines
 *   4. GPS noise filtering (removes sub-20m jitter points)
 *
 * Main thread sends messages; worker replies with processed data.
 * Worker CANNOT access DOM or Leaflet directly.
 *
 * USAGE (main thread):
 *   const worker = new Worker('routeWorker.js');
 *   worker.postMessage({ type: 'parseGeometry', geometry: data.routes[0].geometry, totalDistance: data.routes[0].distance });
 *   worker.onmessage = e => { const { points, distanceKm } = e.data; drawRoute(points); };
 */

self.onmessage = function (e) {
  const { type } = e.data;

  switch (type) {

    /**
     * parseGeometry
     * Input:  { geometry: GeoJSON geometry object, totalDistance: metres }
     * Output: { type: 'geometryParsed', points: [lat,lon][], distanceKm }
     *
     * ⚡ OSRM returns [lon,lat] — Leaflet needs [lat,lon].
     *    Doing this flip for 3000+ points on main thread causes visible jank.
     *    Worker does it in background while map continues to render.
     */
    case 'parseGeometry': {
      const { geometry, totalDistance } = e.data;
      const points = geometry.coordinates.map(function (c) {
        return [c[1], c[0]]; // flip lon,lat → lat,lon
      });
      self.postMessage({
        type       : 'geometryParsed',
        points     : points,
        distanceKm : totalDistance / 1000,
      });
      break;
    }

    /**
     * computeArrowBearings
     * Input:  { points: [lat,lon][] }
     * Output: { type: 'arrowBearings', bearings: [{lat,lon,bearing}] }
     *
     * ⚡ Bearing calculation for 500+ points is CPU-heavy.
     *    Offloading prevents dropped frames on route draw.
     *    Returns max 8 arrow positions evenly distributed along route.
     */
    case 'computeArrowBearings': {
      const { points } = e.data;
      const step     = Math.max(1, Math.floor(points.length / 8));
      const bearings = [];

      for (var i = step; i < points.length - 1; i += step) {
        var lat1 = points[i - 1][0], lon1 = points[i - 1][1];
        var lat2 = points[i][0],     lon2 = points[i][1];

        var dLon  = (lon2 - lon1) * Math.PI / 180;
        var lat1r = lat1 * Math.PI / 180;
        var lat2r = lat2 * Math.PI / 180;
        var x     = Math.sin(dLon) * Math.cos(lat2r);
        var y     = Math.cos(lat1r) * Math.sin(lat2r)
                  - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
        var bearing = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;

        bearings.push({ lat: lat2, lon: lon2, bearing: bearing });
      }

      self.postMessage({ type: 'arrowBearings', bearings: bearings });
      break;
    }

    /**
     * haversineChain
     * Input:  { coords: [lat,lon][] }
     * Output: { type: 'haversineTotal', totalKm }
     *
     * ⚡ Computes cumulative distance along a polyline.
     *    Used to calculate km-to-destination for intermediate stops.
     */
    case 'haversineChain': {
      var coords = e.data.coords;
      var R      = 6371; // Earth radius km
      var total  = 0;

      for (var j = 0; j < coords.length - 1; j++) {
        var a1 = coords[j][0],     o1 = coords[j][1];
        var a2 = coords[j + 1][0], o2 = coords[j + 1][1];
        var dLat2 = (a2 - a1) * Math.PI / 180;
        var dLon2 = (o2 - o1) * Math.PI / 180;
        var ha = Math.sin(dLat2 / 2) * Math.sin(dLat2 / 2)
               + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180)
               * Math.sin(dLon2 / 2) * Math.sin(dLon2 / 2);
        total += R * 2 * Math.atan2(Math.sqrt(ha), Math.sqrt(1 - ha));
      }

      self.postMessage({ type: 'haversineTotal', totalKm: total });
      break;
    }

    /**
     * filterNoisyGps
     * Input:  { rawPoints: [{lat,lon,timestamp?}][], minDistMeters?: number }
     * Output: { type: 'filteredGps', points: [{lat,lon}][] }
     *
     * ⚡ Removes GPS jitter points that are < minDistMeters apart.
     *    Prevents speed spikes and marker micro-jumps on stationary bus.
     *    Default threshold: 20 metres (matches original GPS noise filter).
     */
    case 'filterNoisyGps': {
      var rawPoints    = e.data.rawPoints;
      var minDist      = e.data.minDistMeters !== undefined ? e.data.minDistMeters : 20;
      var Rm           = 6371000; // Earth radius in metres
      var filtered     = rawPoints.length ? [rawPoints[0]] : [];

      for (var k = 1; k < rawPoints.length; k++) {
        var prev  = filtered[filtered.length - 1];
        var cur   = rawPoints[k];
        var dlat  = (cur.lat - prev.lat) * Math.PI / 180;
        var dlon  = (cur.lon - prev.lon) * Math.PI / 180;
        var fa    = Math.sin(dlat / 2) * Math.sin(dlat / 2)
                  + Math.cos(prev.lat * Math.PI / 180) * Math.cos(cur.lat * Math.PI / 180)
                  * Math.sin(dlon / 2) * Math.sin(dlon / 2);
        var dist  = Rm * 2 * Math.atan2(Math.sqrt(fa), Math.sqrt(1 - fa));
        if (dist >= minDist) filtered.push(cur);
      }

      self.postMessage({ type: 'filteredGps', points: filtered });
      break;
    }

    default:
      console.warn('[RouteWorker] Unknown message type:', type);
  }
};
