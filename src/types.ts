// Playtomic API response types

export interface PlaytomicTenant {
  tenant_id: string;
  tenant_uid: string;
  tenant_name: string;
  address: {
    city: string;
    timezone?: string;
    coordinate: { lat: number; lon: number };
  };
}

export interface PlaytomicSlot {
  start_time: string; // "HH:MM:SS" UTC
  duration: number;   // Minuten
  price: string;      // "8 EUR"
}

export interface PlaytomicResourceAvailability {
  resource_id: string;
  start_date: string; // "YYYY-MM-DD"
  slots: PlaytomicSlot[];
}

// clubs.json types

export interface ClubConfig {
  alias: string;
  tenant_id: string;
  name: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  active: boolean;
}

export interface PollConfig {
  opening_window_local: [string, string]; // ["07:00", "23:00"]
  opening_days_ahead: number;
  horizon_days_ahead: number;
}

export interface ClubsJson {
  poll: PollConfig;
  clubs: ClubConfig[];
}

// D1 REST response types

export interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    changed_db: boolean;
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

export interface D1Response<T = Record<string, unknown>> {
  result: D1QueryResult<T>[];
  success: boolean;
  errors: { code: number; message: string }[];
}

// Internal processing types

export interface FlatSlot {
  resource_id: string;
  slot_start_utc: string; // "2026-06-19T04:00:00Z"
  min_duration: number;
  price: string;
}
