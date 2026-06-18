CREATE TABLE IF NOT EXISTS clubs (
  tenant_id TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  city      TEXT,
  lat       REAL,
  lon       REAL,
  timezone  TEXT DEFAULT 'Europe/Berlin',
  active    INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS courts (
  resource_id TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES clubs(tenant_id),
  name        TEXT,
  first_seen  TEXT,
  last_seen   TEXT
);

CREATE TABLE IF NOT EXISTS availability_snapshots (
  poll_ts        TEXT NOT NULL,
  poll_type      TEXT NOT NULL,
  tenant_id      TEXT NOT NULL,
  resource_id    TEXT NOT NULL,
  slot_start_utc TEXT NOT NULL,
  min_duration   INTEGER,
  price          TEXT,
  PRIMARY KEY (poll_ts, resource_id, slot_start_utc)
);

CREATE INDEX IF NOT EXISTS idx_snap_slot
  ON availability_snapshots(resource_id, slot_start_utc);

CREATE INDEX IF NOT EXISTS idx_snap_tenant_time
  ON availability_snapshots(tenant_id, slot_start_utc);
