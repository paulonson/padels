import type { D1QueryResult, D1Response } from './types.js';

const CF_BASE = 'https://api.cloudflare.com/client/v4';
// D1 erlaubt ~100 Bound Parameters pro Query.
const D1_MAX_PARAMS = 90;

function getEnv(): { accountId: string; dbId: string; token: string } {
  const accountId = process.env.CF_ACCOUNT_ID;
  const dbId = process.env.CF_D1_DATABASE_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !dbId || !token) {
    throw new Error(
      'Fehlende Umgebungsvariablen: CF_ACCOUNT_ID, CF_D1_DATABASE_ID und CF_API_TOKEN müssen gesetzt sein.'
    );
  }
  return { accountId, dbId, token };
}

function dbUrl(accountId: string, dbId: string, endpoint: string): string {
  return `${CF_BASE}/accounts/${accountId}/d1/database/${dbId}/${endpoint}`;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<D1QueryResult<T>> {
  const { accountId, dbId, token } = getEnv();
  const res = await fetch(dbUrl(accountId, dbId, 'query'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = (await res.json()) as D1Response<T>;
  if (!body.success) {
    throw new Error(`D1 query fehlgeschlagen: ${JSON.stringify(body.errors)}`);
  }
  return body.result[0];
}

export async function batchInsert(
  sql: string,
  rows: (string | number | null)[][]
): Promise<void> {
  if (rows.length === 0) return;

  // For non-INSERT statements (e.g. UPDATE), execute each row individually.
  const valuesMatch = sql.match(/VALUES\s*(\([^)]+\))/i);
  if (!valuesMatch) {
    for (const row of rows) {
      await query(sql, row);
    }
    return;
  }

  // For INSERT statements: build multi-row VALUES clause per chunk.
  // Chunk size is calculated so total params stay under D1_MAX_PARAMS.
  const singlePlaceholder = valuesMatch[1]; // e.g. "(?,?,?,?,?,?,?)"
  const paramsPerRow = rows[0].length;
  const chunkSize = Math.max(1, Math.floor(D1_MAX_PARAMS / paramsPerRow));
  const insertPrefix = sql.slice(0, sql.search(/VALUES/i));

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesClause = chunk.map(() => singlePlaceholder).join(',');
    const multiSql = `${insertPrefix}VALUES ${valuesClause}`;
    const flatParams = chunk.flat();
    await query(multiSql, flatParams);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
