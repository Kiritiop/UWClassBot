import { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getActiveEnrollmentsWithDetails } from '../db/queries/enrollments';
import { sectionLabel } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('myclasses')
    .setDescription('List all your current enrollments'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

    const term = await getCurrentTerm();
    if (!term) {
      await interaction.editReply({ content: 'No current term configured.' });
      return;
    }

    const rows = await getActiveEnrollmentsWithDetails(interaction.user.id, term.term_code);
    if (rows.length === 0) {
      await interaction.editReply({
        content: `No enrollments found for ${term.name}. Use \`/enroll\` to get started.`,
      });
      return;
    }

    const byCourse = new Map<number, { courseName: string; sections: string[] }>();
    for (const row of rows) {
      if (!byCourse.has(row.course_id)) {
        byCourse.set(row.course_id, {
          courseName: `${row.subject} ${row.catalog_number} - ${row.title}`,
          sections: [],
        });
      }
      byCourse.get(row.course_id)!.sections.push(
        `**${row.section_type} ${row.section_number}** - ${sectionLabel(row)}`,
      );
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`Your classes - ${term.name}`)
      .setDescription(
        [...byCourse.values()]
          .map((c) => `**${c.courseName}**\n${c.sections.join('\n')}`)
          .join('\n\n'),
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
