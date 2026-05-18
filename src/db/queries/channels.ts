import { pool } from '../pool';
import type { DiscordChannel } from '../../types';

export async function getChannelByCourseId(courseId: number, guildId: string): Promise<DiscordChannel | null> {
  const result = await pool.query<DiscordChannel>(
    'SELECT * FROM discord_channels WHERE course_id = $1 AND section_id IS NULL AND guild_id = $2',
    [courseId, guildId],
  );
  return result.rows[0] ?? null;
}

export async function getChannelBySectionId(sectionId: number, guildId: string): Promise<DiscordChannel | null> {
  const result = await pool.query<DiscordChannel>(
    'SELECT * FROM discord_channels WHERE section_id = $1 AND guild_id = $2',
    [sectionId, guildId],
  );
  return result.rows[0] ?? null;
}

export async function insertChannel(
  courseId: number,
  sectionId: number | null,
  channelId: string,
  roleId: string,
  guildId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO discord_channels (course_id, section_id, channel_id, role_id, guild_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [courseId, sectionId, channelId, roleId, guildId],
  );
}

export async function markChannelArchived(channelId: string): Promise<void> {
  await pool.query(
    'UPDATE discord_channels SET is_archived = TRUE WHERE channel_id = $1',
    [channelId],
  );
}

export async function deleteChannelRecord(channelId: string): Promise<void> {
  await pool.query('DELETE FROM discord_channels WHERE channel_id = $1', [channelId]);
}

export async function getChannelsByTermCode(termCode: string, guildId: string): Promise<DiscordChannel[]> {
  const result = await pool.query<DiscordChannel>(
    `SELECT dc.* FROM discord_channels dc
     JOIN courses c ON c.id = dc.course_id
     WHERE c.term_code = $1 AND dc.guild_id = $2`,
    [termCode, guildId],
  );
  return result.rows;
}
