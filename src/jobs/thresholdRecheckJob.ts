import { ChannelType } from 'discord.js';
import { pool } from '../db/pool';
import { client } from '../client';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseById } from '../db/queries/courses';
import { getSectionById } from '../db/queries/sections';
import { ensureSectionRole, ensureSectionChannel } from '../services/channelManager';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function runThresholdRecheckJob(): Promise<void> {
  const term = await getCurrentTerm();
  if (!term) return;

  // Sections with enough active enrollments globally
  const result = await pool.query<{ section_id: number }>(`
    SELECT e.section_id
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    WHERE e.active = TRUE
    AND c.term_code = $1
    GROUP BY e.section_id
    HAVING COUNT(e.id) >= $2
  `, [term.term_code, config.SECTION_THRESHOLD]);

  if (result.rowCount === 0) return;
  logger.info({ count: result.rowCount }, 'Threshold recheck: sections above threshold');

  for (const guild of client.guilds.cache.values()) {
    const categoryName = term.name;
    let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!category) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
    }

    for (const { section_id } of result.rows) {
      // Skip if this guild already has the channel
      const existing = await pool.query(
        'SELECT 1 FROM discord_channels WHERE section_id = $1 AND guild_id = $2',
        [section_id, guild.id],
      );
      if (existing.rowCount && existing.rowCount > 0) continue;

      try {
        const section = await getSectionById(section_id);
        if (!section) continue;
        const course = await getCourseById(section.course_id);
        if (!course) continue;

        const sectionRole = await ensureSectionRole(guild, course, section);
        await ensureSectionChannel(guild, course, section, sectionRole, category.id);

        // Assign the section role to every enrolled member so they can see the new channel
        const enrolledRes = await pool.query<{ user_id: string }>(
          'SELECT user_id FROM enrollments WHERE section_id = $1 AND active = TRUE',
          [section_id],
        );
        for (const { user_id } of enrolledRes.rows) {
          try {
            const guildMember = await guild.members.fetch(user_id);
            await guildMember.roles.add(sectionRole);
          } catch {
            // Member left the server — skip
          }
        }

        const waitingRes = await pool.query<{ user_id: string }>(
          'SELECT user_id FROM waiting_lists WHERE section_id = $1',
          [section_id],
        );
        for (const { user_id } of waitingRes.rows) {
          try {
            const discordUser = await guild.client.users.fetch(user_id);
            await discordUser.send(
              `The section channel for **${course.subject} ${course.catalog_number} ${section.section_type} ${section.section_number}** is now open! Check your Discord channel list.`,
            );
          } catch {
            // DMs disabled — skip
          }
        }
        await pool.query('DELETE FROM waiting_lists WHERE section_id = $1', [section_id]);

        logger.info({ section_id, guildId: guild.id }, 'Threshold recheck: opened channel');
      } catch (err) {
        logger.error({ err, section_id, guildId: guild.id }, 'Threshold recheck: failed');
      }
    }
  }
}
