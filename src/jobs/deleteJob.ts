import { pool } from '../db/pool';
import { client } from '../client';
import { logger } from '../utils/logger';

export async function runDeleteJob(): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const result = await pool.query<{ channel_id: string; id: number }>(`
      SELECT dc.channel_id, dc.id
      FROM discord_channels dc
      JOIN courses c ON c.id = dc.course_id
      JOIN terms t ON t.term_code = c.term_code
      WHERE dc.is_archived = TRUE
      AND dc.guild_id = $1
      AND t.delete_date <= CURRENT_DATE
    `, [guild.id]);

    logger.info({ guildId: guild.id, count: result.rowCount }, 'Delete job: channels to delete');

    for (const { channel_id, id } of result.rows) {
      try {
        const channel = await guild.channels.fetch(channel_id).catch(() => null);
        if (channel) await channel.delete('Channel retention period expired');
        await pool.query('DELETE FROM discord_channels WHERE id = $1', [id]);
      } catch (err) {
        logger.error({ err, channel_id }, 'Delete job: failed to delete channel');
      }
    }
  }

  logger.info('Delete job completed');
}
