import { type ChatInputCommandInteraction } from 'discord.js';
import { getCurrentTerm } from '../../db/queries/terms';
import { syncCurrentTerm } from '../../uwApi/sync';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export async function handleSyncCatalog(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const term = await getCurrentTerm();
  const termCode = term?.term_code ?? config.CURRENT_TERM_CODE;
  logger.info({ termCode, triggeredBy: interaction.user.id }, 'Manual catalog sync triggered');
  try {
    await syncCurrentTerm(termCode);
    await interaction.editReply({
      embeds: [successEmbed(`Catalog sync complete for term ${termCode}.`)],
    });
  } catch (err) {
    logger.error({ err }, 'Manual sync failed');
    await interaction.editReply({
      embeds: [errorEmbed('Sync failed. Check logs for details.')],
    });
  }
}
