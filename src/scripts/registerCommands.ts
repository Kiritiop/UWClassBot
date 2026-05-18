import '../config';
import { REST, Routes } from 'discord.js';
import { config } from '../config';
import { commands } from '../commands/index';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const body = [...commands.values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
  logger.info({ count: body.length }, 'Registering global slash commands...');
  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  logger.info('Global commands registered — may take up to 1 hour to appear in all servers');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to register commands');
  process.exit(1);
});
