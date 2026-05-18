import type { StringSelectMenuInteraction } from 'discord.js';
import { errorEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

// Select menus with this prefix are handled by inline awaitMessageComponent collectors.
const COLLECTOR_PREFIXES = ['enroll_section_'];

export async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const { customId } = interaction;

  if (COLLECTOR_PREFIXES.some((p) => customId.startsWith(p))) {
    return; // Handled by awaitMessageComponent collector in enroll.ts
  }

  logger.warn({ customId }, 'Unhandled select interaction');
  await interaction.reply({ embeds: [errorEmbed('Unknown select menu.')], ephemeral: true });
}
