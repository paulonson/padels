import { runEtl } from './etl.js';
import { handleRequest } from './api.js';

interface Env {
  DB: D1Database;
}

export default {
  // Nächtlicher ETL-Cron (02:00 UTC)
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runEtl(env.DB));
  },

  // HTTP-Anfragen: API + Dashboard + manueller ETL-Trigger
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Manueller ETL-Trigger (für Tests und das Dashboard)
    if (request.method === 'POST' && url.pathname === '/api/etl') {
      let log = '';
      try {
        log = await runEtl(env.DB);
      } catch (e) {
        log = 'ETL-Fehler: ' + (e instanceof Error ? e.message : String(e));
      }
      return new Response(log, { headers: { 'Content-Type': 'text/plain' } });
    }

    return handleRequest(request, env.DB);
  },
} satisfies ExportedHandler<Env>;
