import { TextChannel } from 'discord.js';
import { pool } from '../db/pool';
import { client } from '../client';
import { logger } from '../utils/logger';

export async function runArchiveJob(termCode?: string): Promise<number> {
  let totalArchived = 0;

  for (const guild of client.guilds.cache.values()) {
    const whereClause = termCode
      ? 'AND c.term_code = $3'
      : 'AND t.archive_date <= CURRENT_DATE';
    const params: unknown[] = termCode
      ? [false, guild.id, termCode]
      : [false, guild.id];

    const result = await pool.query<{ channel_id: string; id: number }>(`
      SELECT dc.channel_id, dc.id
      FROM discord_channels dc
      JOIN courses c ON c.id = dc.course_id
      JOIN terms t ON t.term_code = c.term_code
      WHERE dc.is_archived = $1
      AND dc.guild_id = $2
      ${whereClause}
    `, params);

    logger.info({ guildId: guild.id, count: result.rowCount, termCode }, 'Archive job: channels to archive');

    for (const { channel_id, id } of result.rows) {
      try {
        const channel = await guild.channels.fetch(channel_id).catch(() => null);
        if (channel instanceof TextChannel) {
          await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
          await channel.send('*This channel has been archived and is now read-only.*');
        }
        await pool.query('UPDATE discord_channels SET is_archived = TRUE WHERE id = $1', [id]);
        totalArchived++;
      } catch (err) {
        logger.error({ err, channel_id }, 'Archive job: failed to archive channel');
      }
    }
  }

  logger.info({ totalArchived }, 'Archive job completed');
  return totalArchived;
}
