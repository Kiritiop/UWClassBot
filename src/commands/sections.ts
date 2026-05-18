import { SlashCommandBuilder, EmbedBuilder, Colors, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode } from '../db/queries/courses';
import { getSectionsByCourse } from '../db/queries/sections';
import { countEnrollmentsForSection } from '../db/queries/enrollments';
import { sectionLabel, errorEmbed } from '../utils/embeds';
import { config } from '../config';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sections')
    .setDescription('List all sections for a course with times and enrollment counts')
    .addStringOption((o) =>
      o.setName('course_code').setDescription('e.g. CS 135').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const courseCodeRaw = interaction.options.getString('course_code', true);
    const term = await getCurrentTerm();
    if (!term) {
      await interaction.editReply({ embeds: [errorEmbed('No current term configured.')] });
      return;
    }

    // Re-use parseCourseCode from embeds doesn't exist there — import from enrollmentService
    const { parseCourseCode: parse } = await import('../services/enrollmentService');
    const parsed = parse(courseCodeRaw);
    if (!parsed) {
      await interaction.editReply({
        embeds: [errorEmbed(`"${courseCodeRaw}" is not a valid course code.`)],
      });
      return;
    }

    const course = await getCourseByCode(parsed.subject, parsed.catalogNumber, term.term_code);
    if (!course) {
      await interaction.editReply({
        embeds: [errorEmbed(`${parsed.subject} ${parsed.catalogNumber} not found in ${term.name}.`)],
      });
      return;
    }

    const sections = await getSectionsByCourse(course.id);
    if (sections.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed(`No sections are scheduled for ${course.subject} ${course.catalog_number} yet.`)],
      });
      return;
    }

    // Group by section type
    const byType = new Map<string, string[]>();
    for (const section of sections) {
      const count = await countEnrollmentsForSection(section.id);
      const status = count >= config.SECTION_THRESHOLD ? '[open]' : `[waiting ${count}/${config.SECTION_THRESHOLD}]`;
      const line = `**${section.section_type} ${section.section_number}** ${status}\n${sectionLabel(section) || 'Details TBA'}`;
      if (!byType.has(section.section_type)) byType.set(section.section_type, []);
      byType.get(section.section_type)!.push(line);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`${course.subject} ${course.catalog_number} - ${course.title}`)
      .setFooter({ text: `${term.name} | [open] = channel active, [waiting x/y] = needs more students` });

    for (const [type, lines] of byType) {
      embed.addFields({ name: type, value: lines.join('\n\n').slice(0, 1024) });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
