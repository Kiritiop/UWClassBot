import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: config.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected Postgres pool error');
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() AS now');
    logger.info({ now: result.rows[0].now }, 'Postgres connection OK');
  } finally {
    client.release();
  }
}
