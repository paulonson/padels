import type {
  PlaytomicTenant,
  PlaytomicResourceAvailability,
  FlatSlot,
} from './types.js';

const BASE = 'https://api.playtomic.io/v1';
const UA = 'padels-scraper/1.0 (private-market-research)';
const TIMEOUT_MS = 15_000;

function headers(): HeadersInit {
  return { 'User-Agent': UA, Accept: 'application/json' };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: headers(), signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Playtomic HTTP ${res.status} für ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchTenants(params: {
  lat: number;
  lon: number;
  radius: number;
  q?: string;
}): Promise<PlaytomicTenant[]> {
  const p = new URLSearchParams({
    coordinate: `${params.lat},${params.lon}`,
    radius: String(params.radius),
    sport_id: 'PADEL',
    playtomic_status: 'ACTIVE',
    size: '50',
  });
  if (params.q) p.set('q', params.q);
  return fetchJson<PlaytomicTenant[]>(`${BASE}/tenants?${p}`);
}

export async function getTenantByUid(uid: string): Promise<PlaytomicTenant | null> {
  const p = new URLSearchParams({ tenant_uid: uid });
  const results = await fetchJson<PlaytomicTenant[]>(`${BASE}/tenants?${p}`);
  return results[0] ?? null;
}

export async function getAvailability(
  tenantId: string,
  date: string
): Promise<PlaytomicResourceAvailability[]> {
  const p = new URLSearchParams({
    sport_id: 'PADEL',
    start_min: `${date}T00:00:00`,
    start_max: `${date}T23:59:59`,
    tenant_id: tenantId,
  });
  return fetchJson<PlaytomicResourceAvailability[]>(`${BASE}/availability?${p}`);
}

export function flattenSlots(data: PlaytomicResourceAvailability[]): FlatSlot[] {
  const map = new Map<string, FlatSlot>();
  for (const avail of data) {
    for (const slot of avail.slots) {
      const slot_start_utc = `${avail.start_date}T${slot.start_time}Z`;
      const key = `${avail.resource_id}|${slot_start_utc}`;
      const existing = map.get(key);
      if (!existing || slot.duration < existing.min_duration) {
        map.set(key, {
          resource_id: avail.resource_id,
          slot_start_utc,
          min_duration: slot.duration,
          price: slot.price,
        });
      }
    }
  }
  return Array.from(map.values());
}
