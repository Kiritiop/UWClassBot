import { EmbedBuilder, TextChannel } from 'discord.js';
import { client } from '../client';
import { pool } from '../db/pool';
import { getLatestProblem, buildProblemEmbed } from '../leetcode/client';
import { logger } from '../utils/logger';

export async function runLeetcodeDailyJob(): Promise<void> {
  logger.info('LeetCode daily job started');

  let problem;
  try {
    problem = await getLatestProblem();
  } catch (err) {
    logger.error({ err }, 'LeetCode daily job: failed to fetch daily challenge');
    return;
  }

  const embed = buildProblemEmbed(problem);

  const configsRes = await pool.query<{ guild_id: string; leetcode_channel_id: string }>(
    'SELECT guild_id, leetcode_channel_id FROM guild_configs WHERE leetcode_channel_id IS NOT NULL',
  );

  for (const { guild_id, leetcode_channel_id } of configsRes.rows) {
    try {
      const guild = client.guilds.cache.get(guild_id);
      if (!guild) continue;

      const channel = (guild.channels.cache.get(leetcode_channel_id)
        ?? await guild.channels.fetch(leetcode_channel_id).catch(() => null)) as TextChannel | null;
      if (!channel) continue;

      await channel.send({
        content: '## 📅 LeetCode Daily Challenge',
        embeds: [new EmbedBuilder(embed)],
      });

      logger.info({ guildId: guild_id, channelId: leetcode_channel_id }, 'LeetCode daily job: posted');
    } catch (err) {
      logger.error({ err, guild_id }, 'LeetCode daily job: failed to post to guild');
    }
  }
}
