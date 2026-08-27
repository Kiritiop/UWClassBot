import { type ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger';

// Modals with this prefix are handled by inline awaitModalSubmit collectors.
// The global handler must not respond: doing so would consume the interaction
// before the collector can defer, causing "InteractionAlreadyReplied".
const COLLECTOR_PREFIXES = ['enrollall_'];

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (COLLECTOR_PREFIXES.some((p) => interaction.customId.startsWith(p))) {
    return; // Handled by awaitModalSubmit collector in enrollall.ts
  }

  logger.debug({ customId: interaction.customId }, 'Modal submit received (no handler yet)');
  await interaction.reply({ content: 'This modal has no handler yet.', flags: MessageFlags.Ephemeral as number });
}
