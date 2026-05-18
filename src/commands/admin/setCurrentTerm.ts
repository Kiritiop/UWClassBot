import { type ChatInputCommandInteraction } from 'discord.js';
import { setCurrentTerm } from '../../db/queries/terms';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

export async function handleSetCurrentTerm(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const termCode = interaction.options.getString('term_code', true);
  try {
    await setCurrentTerm(termCode);
    await interaction.editReply({
      embeds: [successEmbed(`Current term set to **${termCode}**.`)],
    });
  } catch (err) {
    logger.error({ err, termCode }, 'setCurrentTerm failed');
    await interaction.editReply({
      embeds: [errorEmbed(`Failed to set term ${termCode}. Make sure it exists in the DB.`)],
    });
  }
}
