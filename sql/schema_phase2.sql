-- Silver: Öffnungszeiten-Hülle je Court (sticky – einmal gesehen, bleibt drin)
CREATE TABLE IF NOT EXISTS slot_envelope (
  resource_id TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  weekday     INTEGER NOT NULL,  -- 0=Mo, 6=So  ((strftime('%w')+6)%7)
  slot_of_day TEXT NOT NULL,     -- "HH:MM:SS" UTC
  PRIMARY KEY (resource_id, weekday, slot_of_day)
);

-- Silver: Buchungs-Cutoff je Club (Default 0 min bis genug Daten da)
CREATE TABLE IF NOT EXISTS club_cutoff (
  tenant_id  TEXT PRIMARY KEY,
  cutoff_min INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Silver: Datenqualität je Club und Tag
CREATE TABLE IF NOT EXISTS data_quality (
  tenant_id     TEXT NOT NULL,
  local_date    TEXT NOT NULL,  -- YYYY-MM-DD (UTC-Datum des Slots)
  opening_polls INTEGER DEFAULT 0,
  slots_covered INTEGER DEFAULT 0,
  usable        INTEGER DEFAULT 0,  -- 1 wenn >= 8 Opening-Polls an diesem Tag
  PRIMARY KEY (tenant_id, local_date)
);

-- Silver: Finaler Buchungsstatus je Slot
CREATE TABLE IF NOT EXISTS slot_outcome (
  resource_id    TEXT NOT NULL,
  tenant_id      TEXT NOT NULL,
  slot_start_utc TEXT NOT NULL,
  local_date     TEXT NOT NULL,
  weekday        INTEGER NOT NULL,
  hour_utc       INTEGER NOT NULL,
  state          TEXT NOT NULL,  -- 'booked' | 'free' | 'unknown'
  price          TEXT,
  PRIMARY KEY (resource_id, slot_start_utc)
);
CREATE INDEX IF NOT EXISTS idx_outcome_cell ON slot_outcome(tenant_id, weekday, hour_utc);
CREATE INDEX IF NOT EXISTS idx_outcome_date ON slot_outcome(tenant_id, local_date);

-- Gold: Heatmap-Zellen (Wochentag × Stunde UTC)
CREATE TABLE IF NOT EXISTS cell_stats (
  tenant_id   TEXT NOT NULL,
  weekday     INTEGER NOT NULL,
  hour_utc    INTEGER NOT NULL,
  booked      INTEGER DEFAULT 0,
  free        INTEGER DEFAULT 0,
  n           INTEGER DEFAULT 0,
  utilization REAL,
  ci_low      REAL,
  ci_high     REAL,
  confident   INTEGER DEFAULT 0,  -- 1 wenn n >= 5
  PRIMARY KEY (tenant_id, weekday, hour_utc)
);

-- Gold: Buchungs-Vorlaufkurve
CREATE TABLE IF NOT EXISTS fill_curve (
  tenant_id TEXT NOT NULL,
  weekday   INTEGER NOT NULL,
  hour_utc  INTEGER NOT NULL,
  lead_days INTEGER NOT NULL,  -- 1..7
  p_booked  REAL DEFAULT 0,
  n         INTEGER DEFAULT 0,
  PRIMARY KEY (tenant_id, weekday, hour_utc, lead_days)
);

-- Gold: KPI-Zusammenfassung je Club
CREATE TABLE IF NOT EXISTS club_summary (
  tenant_id    TEXT PRIMARY KEY,
  overall_util REAL,
  prime_util   REAL,
  data_days    INTEGER DEFAULT 0,
  updated_at   TEXT
);
