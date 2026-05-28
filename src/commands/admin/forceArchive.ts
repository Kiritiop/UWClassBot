import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { runArchiveJob } from '../../jobs/archiveJob';
import { pool } from '../../db/pool';

export async function handleForceArchive(interaction: ChatInputCommandInteraction): Promise<void> {
  const termCode = interaction.options.getString('term_code', true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral as number });

  // Verify the term exists
  const termRes = await pool.query<{ name: string }>(
    'SELECT name FROM terms WHERE term_code = $1',
    [termCode],
  );
  if (termRes.rowCount === 0) {
    await interaction.editReply({
      embeds: [errorEmbed(`Term code \`${termCode}\` not found in the database.`)],
    });
    return;
  }
  const termName = termRes.rows[0].name;

  const archived = await runArchiveJob(termCode);

  await interaction.editReply({
    embeds: [
      successEmbed(
        `Force-archived **${archived}** channel(s) for **${termName}** (${termCode}).`,
      ),
    ],
  });
}
