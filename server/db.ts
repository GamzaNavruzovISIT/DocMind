import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let poolUrl: string | null = null;

export function getPool(): pg.Pool {
  if (pool && poolUrl !== config.databaseUrl) void resetPool();
  if (!pool) {
    poolUrl = config.databaseUrl;
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (err) => console.error('[db] ошибка пула:', err.message));
  }
  return pool;
}

export async function resetPool(): Promise<void> {
  const old = pool;
  pool = null;
  poolUrl = null;
  if (old) {
    try {
      await old.end();
    } catch {
    }
  }
}

export async function dbOk(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function testDatabaseUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    try {
      await client.end();
    } catch {
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureSchema(): Promise<void> {
  const sql = await readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  await getPool().query(sql);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}
