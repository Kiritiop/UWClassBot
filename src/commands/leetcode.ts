import { SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getRandomProblem, buildProblemEmbed, type Difficulty } from '../leetcode/client';
import { errorEmbed } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leetcode')
    .setDescription('Get a random LeetCode problem')
    .addStringOption((o) =>
      o
        .setName('difficulty')
        .setDescription('Filter by difficulty (default: any)')
        .setRequired(false)
        .addChoices(
          { name: 'Easy', value: 'Easy' },
          { name: 'Medium', value: 'Medium' },
          { name: 'Hard', value: 'Hard' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

    const difficulty = interaction.options.getString('difficulty') as Difficulty | null;

    try {
      const problem = await getRandomProblem(difficulty ?? undefined);
      const embed = buildProblemEmbed(problem);
      await interaction.editReply({ embeds: [new EmbedBuilder(embed)] });
    } catch (err) {
      await interaction.editReply({
        embeds: [errorEmbed('Could not fetch a LeetCode problem right now. Try again in a moment.')],
      });
    }
  },
};

export default command;
