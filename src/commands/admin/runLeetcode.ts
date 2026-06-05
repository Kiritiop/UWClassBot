import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { runLeetcodeDailyJob } from '../../jobs/leetcodeDailyJob';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

export async function handleRunLeetcode(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });
  try {
    await runLeetcodeDailyJob();
    await interaction.editReply({ embeds: [successEmbed('LeetCode daily job ran successfully.')] });
  } catch (err) {
    logger.error({ err }, 'Manual LeetCode job failed');
    await interaction.editReply({ embeds: [errorEmbed('LeetCode job failed. Check logs for details.')] });
  }
}
