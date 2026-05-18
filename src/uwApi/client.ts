import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const BASE_URL = 'https://openapi.data.uwaterloo.ca';
const MAX_RETRIES = 4;

export const uwApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'x-api-key': config.UW_API_KEY,
    Accept: 'application/json',
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uwGet<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await uwApi.get<T>(path);
      return response.data;
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { response?: { status?: number } }).response?.status;

      if (status === 429) {
        // Exponential backoff: 2s, 4s, 8s, 16s
        const delay = 2_000 * Math.pow(2, attempt);
        logger.debug({ path, attempt, delay }, 'Rate limited (429), retrying after delay');
        await sleep(delay);
        continue;
      }

      // Log 5xx and network errors — callers handle 4xx themselves
      if (!status || status >= 500) {
        const url = (err as { config?: { url?: string } }).config?.url;
        logger.error({ status, url, err: (err as Error).message }, 'UW API request failed');
      }
      throw err;
    }
  }
  logger.error({ path }, 'UW API request failed after max retries (429)');
  throw lastErr;
}
