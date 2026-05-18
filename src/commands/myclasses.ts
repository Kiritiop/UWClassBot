import { SlashCommandBuilder, EmbedBuilder, Colors, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getActiveEnrollments } from '../db/queries/enrollments';
import { getSectionById } from '../db/queries/sections';
import { getCourseById } from '../db/queries/courses';
import { sectionLabel } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('myclasses')
    .setDescription('List all your current enrollments'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const term = await getCurrentTerm();
    if (!term) {
      await interaction.editReply({ content: 'No current term configured.' });
      return;
    }

    const enrollments = await getActiveEnrollments(interaction.user.id);
    if (enrollments.length === 0) {
      await interaction.editReply({
        content: 'You are not enrolled in any courses. Use `/enroll` to get started.',
      });
      return;
    }

    // Group by course
    const byCourse = new Map<number, { courseName: string; sections: string[] }>();

    for (const enrollment of enrollments) {
      const section = await getSectionById(enrollment.section_id);
      if (!section) continue;
      const course = await getCourseById(section.course_id);
      if (!course) continue;

      // Only show enrollments for current term
      if (course.term_code !== term.term_code) continue;

      const key = course.id;
      if (!byCourse.has(key)) {
        byCourse.set(key, { courseName: `${course.subject} ${course.catalog_number} - ${course.title}`, sections: [] });
      }
      byCourse.get(key)!.sections.push(`**${section.section_type} ${section.section_number}** - ${sectionLabel(section)}`);
    }

    if (byCourse.size === 0) {
      await interaction.editReply({
        content: `No enrollments found for ${term.name}. Use \`/enroll\` to get started.`,
      });
      return;
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
