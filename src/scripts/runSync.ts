import '../config';
import { config } from '../config';
import { syncCurrentTerm } from '../uwApi/sync';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  logger.info({ termCode: config.CURRENT_TERM_CODE }, 'Running one-off catalog sync');
  await syncCurrentTerm(config.CURRENT_TERM_CODE);
  await pool.end();
  logger.info('Done');
}

main().catch((err) => {
  logger.error({ err }, 'Sync failed');
  process.exit(1);
});
