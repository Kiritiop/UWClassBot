import { pool } from '../pool';

export interface GuildConfig {
  guild_id: string;
  admin_role_id: string | null;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  const result = await pool.query<GuildConfig>(
    'SELECT * FROM guild_configs WHERE guild_id = $1',
    [guildId],
  );
  return result.rows[0] ?? null;
}

export async function upsertGuildConfig(guildId: string, adminRoleId: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO guild_configs (guild_id, admin_role_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET admin_role_id = $2, updated_at = NOW()`,
    [guildId, adminRoleId],
  );
}
