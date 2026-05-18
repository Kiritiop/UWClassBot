import { SlashCommandBuilder, EmbedBuilder, Colors, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode } from '../db/queries/courses';
import { getSectionsByCourse, getSectionByTypeAndNumber } from '../db/queries/sections';
import { getEnrolledUserIds, isEnrolled } from '../db/queries/enrollments';
import { getUserById } from '../db/queries/users';
import { parseCourseCode, parseSectionArg } from '../services/enrollmentService';
import { errorEmbed, sectionLabel } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('classmates')
    .setDescription('See who is in a course section')
    .addStringOption((o) =>
      o.setName('course_code').setDescription('e.g. CS 135').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('section').setDescription('e.g. LEC 001 (omit to see all sections)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const courseCodeRaw = interaction.options.getString('course_code', true);
    const sectionArg = interaction.options.getString('section');

    const term = await getCurrentTerm();
    if (!term) {
      await interaction.editReply({ embeds: [errorEmbed('No current term configured.')] });
      return;
    }

    const parsed = parseCourseCode(courseCodeRaw);
    if (!parsed) {
      await interaction.editReply({ embeds: [errorEmbed(`"${courseCodeRaw}" is not a valid course code.`)] });
      return;
    }

    const course = await getCourseByCode(parsed.subject, parsed.catalogNumber, term.term_code);
    if (!course) {
      await interaction.editReply({
        embeds: [errorEmbed(`${parsed.subject} ${parsed.catalogNumber} not found in ${term.name}.`)],
      });
      return;
    }

    const allSections = await getSectionsByCourse(course.id);

    // Determine which section(s) to show
    let sectionsToShow = allSections;
    if (sectionArg) {
      const parsedSec = parseSectionArg(sectionArg);
      if (!parsedSec) {
        await interaction.editReply({ embeds: [errorEmbed(`"${sectionArg}" is not a valid section.`)] });
        return;
      }
      const section = await getSectionByTypeAndNumber(course.id, parsedSec.type, parsedSec.number);
      if (!section) {
        await interaction.editReply({
          embeds: [errorEmbed(`Section ${sectionArg} not found for ${course.subject} ${course.catalog_number}.`)],
        });
        return;
      }
      sectionsToShow = [section];
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`${course.subject} ${course.catalog_number} - Classmates`);

    let totalCount = 0;

    for (const section of sectionsToShow) {
      const userIds = await getEnrolledUserIds(section.id);
      if (userIds.length === 0) continue;

      totalCount += userIds.length;

      // Build display list based on privacy settings
      const names: string[] = [];
      for (const uid of userIds) {
        const user = await getUserById(uid);
        if (!user) continue;
        if (user.privacy_setting === 'show_name' && user.real_name) {
          names.push(`${user.real_name} (<@${uid}>)`);
        } else {
          names.push(`<@${uid}>`);
        }
      }

      const label = `${section.section_type} ${section.section_number} (${userIds.length} students)`;
      const value = names.slice(0, 20).join('\n') + (names.length > 20 ? `\n...and ${names.length - 20} more` : '');
      embed.addFields({ name: label, value: value || 'No students yet' });
    }

    if (totalCount === 0) {
      await interaction.editReply({
        embeds: [errorEmbed(`No students enrolled in ${course.subject} ${course.catalog_number}${sectionArg ? ` ${sectionArg}` : ''} yet.`)],
      });
      return;
    }

    embed.setFooter({ text: `${term.name} | ${totalCount} total student${totalCount === 1 ? '' : 's'}` });
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
