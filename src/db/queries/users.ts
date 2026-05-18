import { pool } from '../pool';
import type { User } from '../../types';

export async function upsertUser(discordId: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (discord_id) VALUES ($1)
     ON CONFLICT (discord_id) DO NOTHING`,
    [discordId],
  );
}

export async function getUserById(discordId: string): Promise<User | null> {
  const result = await pool.query<User>('SELECT * FROM users WHERE discord_id = $1', [discordId]);
  return result.rows[0] ?? null;
}

export async function updateUserProfile(
  discordId: string,
  updates: Partial<Pick<User, 'privacy_setting' | 'real_name' | 'program' | 'year_level'>>,
): Promise<void> {
  const fields = Object.entries(updates)
    .filter(([, v]) => v !== undefined)
    .map(([k], i) => `${k} = $${i + 2}`);
  if (fields.length === 0) return;
  const values = Object.values(updates).filter((v) => v !== undefined);
  await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE discord_id = $1`,
    [discordId, ...values],
  );
}
