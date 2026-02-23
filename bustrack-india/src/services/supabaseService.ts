/**
 * supabaseService.ts — Zero-dependency Supabase REST wrapper
 *
 * ⚡ No Supabase JS SDK — that's 120KB+ gzipped.
 *    Direct REST calls via fetch() — same API, 0 bytes overhead.
 *    All functions gracefully return empty/null when Supabase is unconfigured.
 */

let _url = '';
let _key = '';

export function configure(cfg: { url: string; anonKey: string }): void {
  _url = cfg.url.replace(/\/$/, '');
  _key = cfg.anonKey;
}

function headers(): Record<string, string> {
  return { 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!_url || !_key) return null;
  try {
    const r = await fetch(`${_url}/rest/v1/${path}`, { ...init, headers: headers() });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function testConnection(): Promise<boolean> {
  const r = await rest<unknown[]>('buses?limit=1');
  return Array.isArray(r);
}

export async function loadBuses(): Promise<any[]> {
  return (await rest<any[]>('buses?select=*&order=added_at.desc')) ?? [];
}

export async function saveBus(bus: { name: string; stops: string[]; stop_coords?: unknown }): Promise<any> {
  return rest('buses', { method: 'POST', body: JSON.stringify(bus) });
}

export async function deleteBus(id: number): Promise<void> {
  await rest(`buses?id=eq.${id}`, { method: 'DELETE' });
}

export async function saveDriverLocation(loc: Record<string, unknown>): Promise<void> {
  await rest('driver_location?id=eq.1', { method: 'PATCH', body: JSON.stringify(loc) });
}

export async function pollDriverLocation(): Promise<any | null> {
  const rows = await rest<any[]>('driver_location?id=eq.1&select=*');
  return rows?.[0] ?? null;
}

export async function clearDriverSharing(): Promise<void> {
  await rest('driver_location?id=eq.1', { method: 'PATCH', body: JSON.stringify({ sharing: false }) });
}

export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await rest<Array<{ key: string; value: string }>>('settings?select=*');
  return Object.fromEntries((rows ?? []).map(r => [r.key, r.value]));
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await rest('settings', { method: 'POST', body: JSON.stringify({ key, value }), });
}
