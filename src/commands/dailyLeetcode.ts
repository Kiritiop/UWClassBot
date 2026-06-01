import { SlashCommandBuilder, ChannelType, MessageFlags, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { Command } from './index';
import { setLeetcodeChannel } from '../db/queries/guildConfigs';
import { getLatestProblem, buildProblemEmbed } from '../leetcode/client';
import { successEmbed, errorEmbed } from '../utils/embeds';
import { EmbedBuilder } from 'discord.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('daily-leetcode')
    .setDescription('Register this channel for daily LeetCode posts (admins only) and post today\'s challenge now'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

    const { channel } = interaction;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        embeds: [errorEmbed('Run this command inside a text channel.')],
      });
      return;
    }

    await setLeetcodeChannel(interaction.guild!.id, channel.id);

    // Post today's challenge immediately so the admin can confirm it works
    try {
      const problem = await getLatestProblem();
      const embed = buildProblemEmbed(problem);
      await (channel as TextChannel).send({
        content: '## 📅 LeetCode Daily Challenge',
        embeds: [new EmbedBuilder(embed)],
      });
    } catch {
      // Don't fail the registration if the initial post fails
    }

    await interaction.editReply({
      embeds: [successEmbed(`Daily LeetCode challenges will now be posted in <#${channel.id}> every day at 8:00 AM ET.`)],
    });
  },
};

export default command;
