import { runEtl } from './etl.js';
import { runOpeningPoll, runHorizonPoll } from './pollInWorker.js';
import { handleRequest } from './api.js';

interface Env {
  DB: D1Database;
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 2 * * *') {
      ctx.waitUntil(runEtl(env.DB));
    } else if (event.cron === '15 1 * * *') {
      ctx.waitUntil(runHorizonPoll(env.DB));
    } else {
      ctx.waitUntil(runOpeningPoll(env.DB));
    }
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
