import { EmbedBuilder, Colors, type ChatInputCommandInteraction } from 'discord.js';
import { getActiveEnrollments } from '../../db/queries/enrollments';
import { getSectionById } from '../../db/queries/sections';
import { getCourseById } from '../../db/queries/courses';
import { sectionLabel } from '../../utils/embeds';
import { errorEmbed } from '../../utils/embeds';
import { getCurrentTerm } from '../../db/queries/terms';

export async function handleAudit(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);
  const term = await getCurrentTerm();
  const enrollments = await getActiveEnrollments(target.id);

  if (enrollments.length === 0) {
    await interaction.editReply({
      embeds: [errorEmbed(`<@${target.id}> has no active enrollments.`)],
    });
    return;
  }

  const lines: string[] = [];
  for (const e of enrollments) {
    const section = await getSectionById(e.section_id);
    if (!section) continue;
    const course = await getCourseById(section.course_id);
    if (!course) continue;
    lines.push(`**${course.subject} ${course.catalog_number}** ${section.section_type} ${section.section_number} - ${sectionLabel(section)}`);
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`Enrollments for ${target.username}`)
    .setDescription(lines.join('\n') || 'None')
    .setFooter({ text: term?.name ?? '' });

  await interaction.editReply({ embeds: [embed] });
}
