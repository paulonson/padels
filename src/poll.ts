import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { ClubsJson, ClubConfig, FlatSlot } from './types.js';
import { getAvailability, flattenSlots } from './playtomic.js';
import { query, batchInsert, sleep } from './d1.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLUBS_PATH = join(__dirname, '..', 'clubs.json');

function loadClubs(): ClubsJson {
  return JSON.parse(readFileSync(CLUBS_PATH, 'utf-8')) as ClubsJson;
}

function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function isInOpeningWindow(window: [string, string]): boolean {
  const now = new Date();
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return t >= window[0] && t <= window[1];
}

function getDatesToPoll(daysAhead: number): string[] {
  return Array.from({ length: daysAhead + 1 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

async function upsertClubs(clubs: ClubConfig[]): Promise<void> {
  if (clubs.length === 0) return;
  const rows = clubs.map((c) => [
    c.tenant_id,
    c.name,
    c.city ?? null,
    c.lat ?? null,
    c.lon ?? null,
    c.timezone ?? 'Europe/Berlin',
    c.active ? 1 : 0,
  ] as (string | number | null)[]);
  await batchInsert(
    'INSERT OR REPLACE INTO clubs (tenant_id, name, city, lat, lon, timezone, active) VALUES (?,?,?,?,?,?,?)',
    rows
  );
}

async function upsertCourts(
  slots: FlatSlot[],
  tenantId: string,
  nowTs: string
): Promise<void> {
  const resourceIds = [...new Set(slots.map((s) => s.resource_id))];
  if (resourceIds.length === 0) return;

  const insertRows = resourceIds.map((id) => [id, tenantId, nowTs] as (string | null)[]);
  await batchInsert(
    'INSERT OR IGNORE INTO courts (resource_id, tenant_id, first_seen) VALUES (?,?,?)',
    insertRows
  );

  const updateRows = resourceIds.map((id) => [nowTs, id] as (string | null)[]);
  await batchInsert('UPDATE courts SET last_seen=? WHERE resource_id=?', updateRows);
}

async function insertSnapshots(
  slots: FlatSlot[],
  tenantId: string,
  pollType: 'opening' | 'horizon',
  pollTs: string
): Promise<void> {
  if (slots.length === 0) return;
  const rows = slots.map((s) => [
    pollTs,
    pollType,
    tenantId,
    s.resource_id,
    s.slot_start_utc,
    s.min_duration,
    s.price,
  ] as (string | number | null)[]);
  await batchInsert(
    'INSERT OR IGNORE INTO availability_snapshots (poll_ts, poll_type, tenant_id, resource_id, slot_start_utc, min_duration, price) VALUES (?,?,?,?,?,?,?)',
    rows
  );
}

async function pollClub(
  club: ClubConfig,
  dates: string[],
  pollType: 'opening' | 'horizon',
  pollTs: string
): Promise<void> {
  const allSlots: FlatSlot[] = [];
  for (const date of dates) {
    const data = await getAvailability(club.tenant_id, date);
    allSlots.push(...flattenSlots(data));
  }

  const courts = new Set(allSlots.map((s) => s.resource_id)).size;
  await upsertCourts(allSlots, club.tenant_id, pollTs);
  await insertSnapshots(allSlots, club.tenant_id, pollType, pollTs);
  console.log(`  [${club.alias}] ${allSlots.length} Slots auf ${courts} Courts (${dates.length} Tage)`);
}

async function main(): Promise<void> {
  const typeIdx = process.argv.findIndex((a) => a === '--type');
  const pollType = (typeIdx >= 0 ? process.argv[typeIdx + 1] : 'opening') as 'opening' | 'horizon';

  const config = loadClubs();
  const activeClubs = config.clubs.filter((c) => c.active);

  if (activeClubs.length === 0) {
    console.log('Keine aktiven Clubs in clubs.json. Mit "npm run clubs -- add" hinzufügen.');
    process.exit(0);
  }

  if (pollType === 'opening' && !isInOpeningWindow(config.poll.opening_window_local)) {
    console.log(`Poll übersprungen – außerhalb des Öffnungsfensters (${config.poll.opening_window_local[0]}–${config.poll.opening_window_local[1]} Berlin).`);
    process.exit(0);
  }

  const pollTs = nowUtc();
  const daysAhead = pollType === 'horizon'
    ? config.poll.horizon_days_ahead
    : config.poll.opening_days_ahead;
  const dates = getDatesToPoll(daysAhead);

  console.log(`\n[${pollTs}] Poll-Typ: ${pollType} | Daten: ${dates[0]} – ${dates[dates.length - 1]} | Clubs: ${activeClubs.length}`);

  await upsertClubs(activeClubs);

  let totalSlots = 0;
  let errors = 0;

  for (const club of activeClubs) {
    try {
      const before = totalSlots;
      await pollClub(club, dates, pollType, pollTs);
      // Zähle Zeilen via Snapshot-Count (Näherung: Slots der letzten Runde)
      void before;
    } catch (err) {
      console.error(`  [${club.alias}] FEHLER: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
    if (activeClubs.indexOf(club) < activeClubs.length - 1) {
      await sleep(1500);
    }
  }

  // Gesamtanzahl aus D1 abrufen
  const result = await query<{ n: number }>(
    "SELECT COUNT(*) as n FROM availability_snapshots WHERE poll_ts = ?",
    [pollTs]
  );
  totalSlots = result.results[0]?.n ?? 0;

  console.log(`\nFertig: ${totalSlots} Snapshots eingefügt | ${errors} Fehler.\n`);
  if (errors > 0) process.exit(1);
}

await main();
