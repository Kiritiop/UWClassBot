import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { upsertUser, updateUserProfile } from '../db/queries/users';
import { successEmbed, errorEmbed } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('Choose how classmates see your name in /classmates')
    .addStringOption((o) =>
      o
        .setName('setting')
        .setDescription('How to display your name')
        .setRequired(true)
        .addChoices(
          { name: 'Handle only (@username)', value: 'handle_only' },
          { name: 'Show full name', value: 'show_name' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

    const setting = interaction.options.getString('setting', true) as 'handle_only' | 'show_name';

    await upsertUser(interaction.user.id);

    const updates: Parameters<typeof updateUserProfile>[1] = { privacy_setting: setting };

    if (setting === 'show_name') {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      updates.real_name = member.displayName;
    }

    await updateUserProfile(interaction.user.id, updates);

    const description =
      setting === 'show_name'
        ? `Classmates will see your name as **${updates.real_name}**.`
        : 'Classmates will only see your handle.';

    await interaction.editReply({ embeds: [successEmbed(description)] });
  },
};

export default command;
