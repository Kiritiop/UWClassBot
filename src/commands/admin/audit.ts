import { EmbedBuilder, Colors, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { getActiveEnrollmentsWithDetails } from '../../db/queries/enrollments';
import { sectionLabel, errorEmbed } from '../../utils/embeds';
import { getCurrentTerm } from '../../db/queries/terms';

export async function handleAudit(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

  const target = interaction.options.getUser('user', true);
  const term = await getCurrentTerm();
  if (!term) {
    await interaction.editReply({ embeds: [errorEmbed('No current term configured.')] });
    return;
  }

  const rows = await getActiveEnrollmentsWithDetails(target.id, term.term_code);

  if (rows.length === 0) {
    await interaction.editReply({
      embeds: [errorEmbed(`<@${target.id}> has no active enrollments in ${term.name}.`)],
    });
    return;
  }

  const lines = rows.map(
    (r) => `**${r.subject} ${r.catalog_number}** ${r.section_type} ${r.section_number} - ${sectionLabel(r)}`,
  );

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`Enrollments for ${target.username}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: term.name });

  await interaction.editReply({ embeds: [embed] });
}
