import { EmbedBuilder, TextChannel } from 'discord.js';
import { client } from '../client';
import { pool } from '../db/pool';
import { getLatestProblem, getRandomProblem, buildProblemEmbed, type LeetCodeProblem } from '../leetcode/client';
import { markProblemPosted, getPostedQuestionIds } from '../db/queries/leetcode';
import { logger } from '../utils/logger';

export async function runLeetcodeDailyJob(): Promise<void> {
  logger.info('LeetCode daily job started');

  // Fetch the latest problem once — shared across guilds for efficiency
  let latestProblem: LeetCodeProblem | null = null;
  try {
    latestProblem = await getLatestProblem();
  } catch (err) {
    logger.error({ err }, 'LeetCode daily job: failed to fetch latest problem');
  }

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

      let postedIds: Set<string>;
      try {
        postedIds = await getPostedQuestionIds(guild_id);
      } catch {
        // Table may not exist yet if migration hasn't run — treat as empty history
        postedIds = new Set();
      }

      // Use the latest problem if it's free and hasn't been posted to this guild yet.
      // Otherwise fall back to a random unseen free problem.
      let problem: LeetCodeProblem;
      let isLatest = false;

      if (latestProblem && !latestProblem.isPremium && !postedIds.has(latestProblem.questionId)) {
        problem = latestProblem;
        isLatest = true;
      } else {
        const reason = !latestProblem
          ? 'fetch failed'
          : latestProblem.isPremium
            ? 'latest is premium'
            : 'latest already posted';
        logger.info({ guild_id, reason }, 'LeetCode daily job: falling back to random problem');
        problem = await getRandomProblem(undefined, postedIds);
      }

      const header = isLatest
        ? '## LeetCode New Problem'
        : '## LeetCode Daily Problem (random)';

      await channel.send({
        content: header,
        embeds: [new EmbedBuilder(buildProblemEmbed(problem))],
      });

      await markProblemPosted(guild_id, problem.questionId).catch(() => null);
      logger.info({ guildId: guild_id, questionId: problem.questionId, isLatest }, 'LeetCode daily job: posted');
    } catch (err) {
      logger.error({ err, guild_id }, 'LeetCode daily job: failed to post to guild');
    }
  }
}
