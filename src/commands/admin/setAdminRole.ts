import { type ChatInputCommandInteraction } from 'discord.js';
import { successEmbed } from '../../utils/embeds';
import { upsertGuildConfig } from '../../db/queries/guildConfigs';

export async function handleSetAdminRole(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const role = interaction.options.getRole('role', true);
  await upsertGuildConfig(interaction.guild!.id, role.id);
  await interaction.editReply({
    embeds: [successEmbed(`Admin role set to **${role.name}**. Members with this role can now use \`/admin\` commands.`)],
  });
}
