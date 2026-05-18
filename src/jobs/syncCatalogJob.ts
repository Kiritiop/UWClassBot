import { syncTerm } from '../uwApi/sync';
import { getCurrentTerm } from '../db/queries/terms';
import { logger } from '../utils/logger';

export async function runSyncCatalogJob(): Promise<void> {
  logger.info('Catalog sync job started');
  const term = await getCurrentTerm();
  if (!term) {
    logger.warn('Catalog sync job: no current term configured');
    return;
  }
  try {
    await syncTerm(term.term_code);
    logger.info('Catalog sync job completed');
  } catch (err) {
    logger.error({ err }, 'Catalog sync job failed');
  }
}
