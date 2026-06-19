import { getAvailability, flattenSlots } from '../playtomic.js';
import type { FlatSlot } from '../types.js';

const OPENING_WINDOW: [string, string] = ['07:00', '23:00'];
const OPENING_DAYS_AHEAD = 1;
const HORIZON_DAYS_AHEAD = 7;

interface ClubRow { tenant_id: string }

function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function getDates(daysAhead: number): string[] {
  return Array.from({ length: daysAhead + 1 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function isInOpeningWindow(): boolean {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return t >= OPENING_WINDOW[0] && t <= OPENING_WINDOW[1];
}

async function pollClub(
  db: D1Database,
  tenantId: string,
  pollType: 'opening' | 'horizon',
  dates: string[],
  pollTs: string
): Promise<void> {
  const allSlots: FlatSlot[] = [];
  for (const date of dates) {
    const data = await getAvailability(tenantId, date);
    allSlots.push(...flattenSlots(data));
  }
  if (allSlots.length === 0) return;

  const resourceIds = [...new Set(allSlots.map(s => s.resource_id))];
  await db.batch(
    resourceIds.map(id =>
      db.prepare('INSERT OR IGNORE INTO courts (resource_id, tenant_id, first_seen) VALUES (?,?,?)')
        .bind(id, tenantId, pollTs)
    )
  );

  const snapStmts = allSlots.map(s =>
    db.prepare(
      'INSERT OR IGNORE INTO availability_snapshots (poll_ts, poll_type, tenant_id, resource_id, slot_start_utc, min_duration, price) VALUES (?,?,?,?,?,?,?)'
    ).bind(pollTs, pollType, tenantId, s.resource_id, s.slot_start_utc, s.min_duration, s.price ?? null)
  );
  for (let i = 0; i < snapStmts.length; i += 100) {
    await db.batch(snapStmts.slice(i, i + 100));
  }
}

async function runPoll(db: D1Database, pollType: 'opening' | 'horizon', daysAhead: number): Promise<void> {
  const { results } = await db.prepare('SELECT tenant_id FROM clubs WHERE active = 1').all<ClubRow>();
  if (!results.length) return;
  const pollTs = nowUtc();
  const dates = getDates(daysAhead);
  for (const { tenant_id } of results) {
    await pollClub(db, tenant_id, pollType, dates, pollTs);
  }
}

export async function runOpeningPoll(db: D1Database): Promise<void> {
  if (!isInOpeningWindow()) return;
  await runPoll(db, 'opening', OPENING_DAYS_AHEAD);
}

export async function runHorizonPoll(db: D1Database): Promise<void> {
  await runPoll(db, 'horizon', HORIZON_DAYS_AHEAD);
}
