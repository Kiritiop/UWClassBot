import type { ButtonInteraction } from 'discord.js';
import { errorEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

// These prefixes are handled by inline awaitMessageComponent collectors.
// The global handler must not respond — doing so would consume the interaction
// before the collector's showModal/update call, causing "InteractionAlreadyReplied".
// Orphaned clicks (no active collector) will show Discord's native "interaction failed".
const COLLECTOR_PREFIXES = ['setup_privacy_'];

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  if (COLLECTOR_PREFIXES.some((p) => customId.startsWith(p))) {
    return; // Handled by awaitMessageComponent collector in the command
  }

  logger.warn({ customId }, 'Unhandled button interaction');
  await interaction.reply({ embeds: [errorEmbed('Unknown button.')], ephemeral: true });
}
