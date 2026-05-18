import 'dotenv/config';
import { z } from 'zod';

// Prefer the public URL (reachable outside Railway) over the internal one
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const configSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DISCORD_ADMIN_ROLE_ID: z.string().min(1).optional(),
  UW_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  CURRENT_TERM_CODE: z.string().min(1),
  SECTION_THRESHOLD: z.coerce.number().int().positive().default(3),
  ARCHIVE_DAYS_AFTER_EXAMS: z.coerce.number().int().positive().default(14),
  DELETE_DAYS_AFTER_ARCHIVE: z.coerce.number().int().positive().default(60),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
