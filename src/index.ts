import './config'; // validates env vars early, exits if invalid
import { Events, InteractionType } from 'discord.js';
import { client } from './client';
import { config } from './config';
import { testConnection } from './db/pool';
import { commands } from './commands/index';
import { handleButton } from './interactions/buttons';
import { handleSelect } from './interactions/selects';
import { handleModal } from './interactions/modals';
import { handleAutocomplete } from './interactions/autocomplete';
import { registerJobs } from './jobs/index';
import { logger } from './utils/logger';

client.once(Events.ClientReady, async (c) => {
  logger.info({ tag: c.user.tag }, 'Discord client ready');
  registerJobs();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction).catch(() => null);
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ commandName: interaction.commandName }, 'Unknown command');
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, commandName: interaction.commandName }, 'Command error');
      const msg = { content: 'Something went wrong. Please try again.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
    return;
  }

  if (interaction.type === InteractionType.MessageComponent) {
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    await handleModal(interaction);
  }
});

async function main(): Promise<void> {
  logger.info('Starting UWClassBot bot...');
  await testConnection();
  await client.login(config.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  console.error('FATAL:', err);
  process.exit(1);
});
