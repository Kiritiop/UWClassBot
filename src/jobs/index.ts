import cron from 'node-cron';
import { logger } from '../utils/logger';
import { runSyncCatalogJob } from './syncCatalogJob';
import { runArchiveJob } from './archiveJob';
import { runDeleteJob } from './deleteJob';
import { runThresholdRecheckJob } from './thresholdRecheckJob';
import { runCleanupRolesJob } from './cleanupRolesJob';
import { runLeetcodeDailyJob } from './leetcodeDailyJob';

export function registerJobs(): void {
  // 03:00 ET — daily catalog sync
  cron.schedule('0 3 * * *', () => {
    runSyncCatalogJob().catch((err) => logger.error({ err }, 'Sync catalog job error'));
  }, { timezone: 'America/Toronto' });

  // 03:30 ET — archive channels for expired terms
  cron.schedule('30 3 * * *', () => {
    runArchiveJob().catch((err) => logger.error({ err }, 'Archive job error'));
  }, { timezone: 'America/Toronto' });

  // 04:00 ET — delete archived channels past retention
  cron.schedule('0 4 * * *', () => {
    runDeleteJob().catch((err) => logger.error({ err }, 'Delete job error'));
  }, { timezone: 'America/Toronto' });

  // 04:30 ET — recheck waiting lists for threshold
  cron.schedule('30 4 * * *', () => {
    runThresholdRecheckJob().catch((err) => logger.error({ err }, 'Threshold recheck job error'));
  }, { timezone: 'America/Toronto' });

  // 05:00 ET — delete roles with no enrolled members
  cron.schedule('0 5 * * *', () => {
    runCleanupRolesJob().catch((err) => logger.error({ err }, 'Cleanup roles job error'));
  }, { timezone: 'America/Toronto' });

  // 08:00 ET — post LeetCode daily challenge
  cron.schedule('0 8 * * *', () => {
    runLeetcodeDailyJob().catch((err) => logger.error({ err }, 'LeetCode daily job error'));
  }, { timezone: 'America/Toronto' });

  logger.info('Cron jobs registered (sync 03:00, archive 03:30, delete 04:00, recheck 04:30, cleanup 05:00, leetcode 08:00 ET)');
}
