import { type ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger';

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  logger.debug({ customId: interaction.customId }, 'Modal submit received (no handler yet)');
  await interaction.reply({ content: 'This modal has no handler yet.', flags: MessageFlags.Ephemeral as number });
}
