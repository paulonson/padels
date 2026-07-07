import { getDashboardHtml } from './dashboard.js';
import { getExportJson } from './export.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

export async function handleRequest(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/' || path === '') {
      return new Response(getDashboardHtml(), { headers: HTML_HEADERS });
    }

    if (path === '/api/clubs') {
      const rows = await db.prepare(`
        SELECT c.tenant_id, c.name, c.city, c.timezone,
          cs.overall_util, cs.prime_util, cs.data_days, cs.updated_at
        FROM clubs c
        LEFT JOIN club_summary cs ON cs.tenant_id = c.tenant_id
        WHERE c.active = 1
        ORDER BY c.name
      `).all();
      return Response.json(rows.results, { headers: JSON_HEADERS });
    }

    if (path === '/api/quality') {
      const rows = await db.prepare(`
        SELECT dq.tenant_id, c.name, dq.local_date, dq.opening_polls, dq.slots_covered, dq.usable
        FROM data_quality dq
        JOIN clubs c ON c.tenant_id = dq.tenant_id
        ORDER BY dq.local_date DESC
        LIMIT 100
      `).all();
      return Response.json(rows.results, { headers: JSON_HEADERS });
    }

    // /api/clubs/:id/cells
    const cellsMatch = path.match(/^\/api\/clubs\/([^/]+)\/cells$/);
    if (cellsMatch) {
      const rows = await db.prepare(`
        SELECT weekday, hour_utc, booked, free, n, utilization, ci_low, ci_high, confident
        FROM cell_stats
        WHERE tenant_id = ?
        ORDER BY weekday, hour_utc
      `).bind(cellsMatch[1]).all();
      return Response.json(rows.results, { headers: JSON_HEADERS });
    }

    // /api/clubs/:id/fillcurve?weekday=&hour=
    const curveMatch = path.match(/^\/api\/clubs\/([^/]+)\/fillcurve$/);
    if (curveMatch) {
      const weekday = url.searchParams.get('weekday') ?? '0';
      const hour = url.searchParams.get('hour') ?? '0';
      const rows = await db.prepare(`
        SELECT lead_days, p_booked, n
        FROM fill_curve
        WHERE tenant_id = ? AND weekday = ? AND hour_utc = ?
        ORDER BY lead_days
      `).bind(curveMatch[1], weekday, hour).all();
      return Response.json(rows.results, { headers: JSON_HEADERS });
    }

    // /api/clubs/:id/summary
    const summaryMatch = path.match(/^\/api\/clubs\/([^/]+)\/summary$/);
    if (summaryMatch) {
      const row = await db.prepare(
        `SELECT * FROM club_summary WHERE tenant_id = ?`
      ).bind(summaryMatch[1]).first();
      return Response.json(row ?? null, { headers: JSON_HEADERS });
    }

    // /api/compare/fillcurve?weekday=&hour=
    if (path === '/api/compare/fillcurve') {
      const weekday = url.searchParams.get('weekday') ?? '0';
      const hour = url.searchParams.get('hour') ?? '0';
      const rows = await db.prepare(`
        SELECT fc.tenant_id, c.name, fc.lead_days, fc.p_booked, fc.n
        FROM fill_curve fc
        JOIN clubs c ON c.tenant_id = fc.tenant_id
        WHERE c.active = 1 AND fc.weekday = ? AND fc.hour_utc = ?
        ORDER BY fc.tenant_id, fc.lead_days
      `).bind(weekday, hour).all();
      return Response.json(rows.results, { headers: JSON_HEADERS });
    }

    if (path === '/api/export') {
      const doc = await getExportJson(db);
      return Response.json(doc, {
        headers: { ...JSON_HEADERS, 'Content-Disposition': 'attachment; filename="padels-export.json"' },
      });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS });
  }
}
