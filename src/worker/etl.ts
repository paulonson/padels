export async function runEtl(db: D1Database): Promise<string> {
  const log: string[] = [];
  const t = (msg: string) => { log.push(`[${new Date().toISOString()}] ${msg}`); console.log(msg); };

  t('ETL gestartet');
  await etlSlotEnvelope(db, t);
  await etlDataQuality(db, t);
  await etlSlotOutcome(db, t);
  await etlCellStats(db, t);
  await etlFillCurve(db, t);
  await etlClubSummary(db, t);
  t('ETL abgeschlossen');

  return log.join('\n');
}

// Step 1: Öffnungszeiten-Hülle aus horizon-Snapshots (sticky)
async function etlSlotEnvelope(db: D1Database, t: (m: string) => void): Promise<void> {
  const r = await db.prepare(`
    INSERT OR IGNORE INTO slot_envelope (resource_id, tenant_id, weekday, slot_of_day)
    SELECT DISTINCT
      resource_id,
      tenant_id,
      (CAST(strftime('%w', slot_start_utc) AS INTEGER) + 6) % 7,
      substr(slot_start_utc, 12, 8)
    FROM availability_snapshots
    WHERE poll_type = 'horizon'
  `).run();
  t(`slot_envelope: ${r.meta.changes} neue Einträge`);
}

// Step 2: Datenqualität je Club und Tag
async function etlDataQuality(db: D1Database, t: (m: string) => void): Promise<void> {
  const r = await db.prepare(`
    INSERT OR REPLACE INTO data_quality (tenant_id, local_date, opening_polls, slots_covered, usable)
    SELECT
      tenant_id,
      substr(slot_start_utc, 1, 10),
      COUNT(DISTINCT poll_ts),
      COUNT(DISTINCT resource_id || '|' || slot_start_utc),
      CASE WHEN COUNT(DISTINCT poll_ts) >= 8 THEN 1 ELSE 0 END
    FROM availability_snapshots
    WHERE poll_type = 'opening'
    GROUP BY tenant_id, substr(slot_start_utc, 1, 10)
  `).run();
  t(`data_quality: ${r.meta.changes} Tage aktualisiert`);
}

// Step 3: Buchungsstatus je vergangenen Slot
// Logik: Letzter opening-Poll vor slot_start bestimmt ob frei oder gebucht.
async function etlSlotOutcome(db: D1Database, t: (m: string) => void): Promise<void> {
  // Alle vergangenen Horizon-Slots (56-Tage-Fenster)
  const horizonResult = await db.prepare(`
    SELECT DISTINCT resource_id, tenant_id, slot_start_utc, MIN(price) as price
    FROM availability_snapshots
    WHERE poll_type = 'horizon'
    AND slot_start_utc < datetime('now', '-5 minutes')
    AND slot_start_utc > datetime('now', '-56 days')
    GROUP BY resource_id, slot_start_utc
  `).all<{ resource_id: string; tenant_id: string; slot_start_utc: string; price: string }>();

  if (!horizonResult.results.length) { t('slot_outcome: keine vergangenen Slots'); return; }

  // Opening-Snapshot-Lookup aufbauen (resource|slot|poll → true)
  const openingResult = await db.prepare(`
    SELECT resource_id, slot_start_utc, poll_ts
    FROM availability_snapshots
    WHERE poll_type = 'opening'
    AND poll_ts > datetime('now', '-56 days')
  `).all<{ resource_id: string; slot_start_utc: string; poll_ts: string }>();

  const seenInPoll = new Set<string>();
  for (const s of openingResult.results) {
    seenInPoll.add(`${s.resource_id}|${s.slot_start_utc}|${s.poll_ts}`);
  }

  // Opening-Poll-Timestamps je Tenant (sortiert)
  const pollsResult = await db.prepare(`
    SELECT DISTINCT tenant_id, poll_ts
    FROM availability_snapshots
    WHERE poll_type = 'opening'
    AND poll_ts > datetime('now', '-56 days')
    ORDER BY poll_ts
  `).all<{ tenant_id: string; poll_ts: string }>();

  const tenantPolls = new Map<string, string[]>();
  for (const { tenant_id, poll_ts } of pollsResult.results) {
    if (!tenantPolls.has(tenant_id)) tenantPolls.set(tenant_id, []);
    tenantPolls.get(tenant_id)!.push(poll_ts);
  }

  // Jeden Slot klassifizieren
  const stmts: D1PreparedStatement[] = [];
  for (const slot of horizonResult.results) {
    const polls = tenantPolls.get(slot.tenant_id) ?? [];
    const decisionPoll = findLastBefore(polls, slot.slot_start_utc);

    const d = new Date(slot.slot_start_utc);
    const weekday = (d.getUTCDay() + 6) % 7;
    const hour_utc = d.getUTCHours();
    const local_date = slot.slot_start_utc.slice(0, 10);

    const state = !decisionPoll
      ? 'unknown'
      : seenInPoll.has(`${slot.resource_id}|${slot.slot_start_utc}|${decisionPoll}`)
        ? 'free'
        : 'booked';

    stmts.push(db.prepare(
      `INSERT OR REPLACE INTO slot_outcome
       (resource_id, tenant_id, slot_start_utc, local_date, weekday, hour_utc, state, price)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(slot.resource_id, slot.tenant_id, slot.slot_start_utc, local_date, weekday, hour_utc, state, slot.price ?? ''));
  }

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
  t(`slot_outcome: ${stmts.length} Slots klassifiziert`);
}

// Binäre Suche: letzter Wert <= target
function findLastBefore(sorted: string[], target: string): string | undefined {
  let lo = 0, hi = sorted.length - 1, result: string | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) { result = sorted[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

// Step 4: Heatmap-Zellen mit Wilson-Konfidenzintervall
async function etlCellStats(db: D1Database, t: (m: string) => void): Promise<void> {
  const rows = await db.prepare(`
    SELECT tenant_id, weekday, hour_utc,
      SUM(CASE WHEN state='booked'  THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN state='free'    THEN 1 ELSE 0 END) as free,
      SUM(CASE WHEN state!='unknown' THEN 1 ELSE 0 END) as n
    FROM slot_outcome
    GROUP BY tenant_id, weekday, hour_utc
  `).all<{ tenant_id: string; weekday: number; hour_utc: number; booked: number; free: number; n: number }>();

  const MIN_N = 5;
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    const util = row.n > 0 ? row.booked / row.n : null;
    let ci_low: number | null = null, ci_high: number | null = null;
    if (util !== null && row.n >= MIN_N) {
      const z = 1.96, p = util, n = row.n;
      const d = 1 + z * z / n;
      const c = (p + z * z / (2 * n)) / d;
      const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
      ci_low = Math.max(0, c - m);
      ci_high = Math.min(1, c + m);
    }
    stmts.push(db.prepare(
      `INSERT OR REPLACE INTO cell_stats
       (tenant_id, weekday, hour_utc, booked, free, n, utilization, ci_low, ci_high, confident)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(row.tenant_id, row.weekday, row.hour_utc, row.booked, row.free, row.n,
      util, ci_low, ci_high, row.n >= MIN_N ? 1 : 0));
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  t(`cell_stats: ${stmts.length} Zellen berechnet`);
}

// Step 5: Buchungs-Vorlaufkurve (wie früh buchen Kunden?)
async function etlFillCurve(db: D1Database, t: (m: string) => void): Promise<void> {
  const rows = await db.prepare(`
    SELECT
      h.tenant_id,
      so.weekday,
      so.hour_utc,
      CAST(julianday(h.slot_start_utc) - julianday(h.poll_ts) AS INTEGER) AS lead_days,
      COUNT(*) AS n,
      SUM(CASE WHEN so.state = 'booked' THEN 1 ELSE 0 END) AS n_booked
    FROM availability_snapshots h
    INNER JOIN slot_outcome so
      ON so.resource_id = h.resource_id
      AND so.slot_start_utc = h.slot_start_utc
    WHERE h.poll_type = 'horizon'
    AND h.slot_start_utc < datetime('now')
    AND h.slot_start_utc > datetime('now', '-56 days')
    AND CAST(julianday(h.slot_start_utc) - julianday(h.poll_ts) AS INTEGER) BETWEEN 1 AND 7
    GROUP BY h.tenant_id, so.weekday, so.hour_utc, lead_days
  `).all<{ tenant_id: string; weekday: number; hour_utc: number; lead_days: number; n: number; n_booked: number }>();

  const stmts: D1PreparedStatement[] = rows.results.map(r =>
    db.prepare(
      `INSERT OR REPLACE INTO fill_curve (tenant_id, weekday, hour_utc, lead_days, p_booked, n)
       VALUES (?,?,?,?,?,?)`
    ).bind(r.tenant_id, r.weekday, r.hour_utc, r.lead_days, r.n > 0 ? r.n_booked / r.n : 0, r.n)
  );
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  t(`fill_curve: ${stmts.length} Vorlauf-Datenpunkte`);
}

// Step 6: KPI-Zusammenfassung je Club
async function etlClubSummary(db: D1Database, t: (m: string) => void): Promise<void> {
  const clubs = await db.prepare(`SELECT DISTINCT tenant_id FROM cell_stats`).all<{ tenant_id: string }>();
  const stmts: D1PreparedStatement[] = [];

  for (const { tenant_id } of clubs.results) {
    const cells = await db.prepare(
      `SELECT weekday, hour_utc, booked, n FROM cell_stats WHERE tenant_id = ?`
    ).bind(tenant_id).all<{ weekday: number; hour_utc: number; booked: number; n: number }>();

    const all = cells.results.filter(c => c.n > 0);
    const totalBooked = all.reduce((s, c) => s + c.booked, 0);
    const totalN = all.reduce((s, c) => s + c.n, 0);
    const overallUtil = totalN > 0 ? totalBooked / totalN : 0;

    // Prime: Mo–Fr (0–4), 17–21 Uhr UTC (≈ 18–22 Uhr Berlin)
    const prime = all.filter(c => c.weekday <= 4 && c.hour_utc >= 17 && c.hour_utc <= 21);
    const primeBkd = prime.reduce((s, c) => s + c.booked, 0);
    const primeN = prime.reduce((s, c) => s + c.n, 0);
    const primeUtil = primeN > 0 ? primeBkd / primeN : 0;

    const days = await db.prepare(
      `SELECT COUNT(DISTINCT local_date) as n FROM slot_outcome WHERE tenant_id = ? AND state != 'unknown'`
    ).bind(tenant_id).first<{ n: number }>();

    stmts.push(db.prepare(
      `INSERT OR REPLACE INTO club_summary (tenant_id, overall_util, prime_util, data_days, updated_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(tenant_id, overallUtil, primeUtil, days?.n ?? 0));
  }

  if (stmts.length) await db.batch(stmts);
  t(`club_summary: ${stmts.length} Clubs`);
}
