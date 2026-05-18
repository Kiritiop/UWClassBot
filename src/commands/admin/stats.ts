import { EmbedBuilder, Colors, type ChatInputCommandInteraction } from 'discord.js';
import { pool } from '../../db/pool';
import { getCurrentTerm } from '../../db/queries/terms';

export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const [usersRes, coursesRes, sectionsRes, enrollmentsRes, channelsRes, term] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM users'),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM courses'),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM sections'),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM enrollments WHERE active = TRUE'),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM discord_channels WHERE is_archived = FALSE'),
    getCurrentTerm(),
  ]);

  const channels = parseInt(channelsRes.rows[0].count, 10);
  const guildChannels = interaction.guild!.channels.cache.size;
  const capacityPct = Math.round((guildChannels / 500) * 100);

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle('ClassMatch Server Stats')
    .addFields(
      { name: 'Current term', value: term?.name ?? 'None', inline: true },
      { name: 'Users', value: usersRes.rows[0].count, inline: true },
      { name: 'Courses in DB', value: coursesRes.rows[0].count, inline: true },
      { name: 'Sections in DB', value: sectionsRes.rows[0].count, inline: true },
      { name: 'Active enrollments', value: enrollmentsRes.rows[0].count, inline: true },
      { name: 'Active channels', value: `${channels} (${capacityPct}% server capacity)`, inline: true },
    );

  if (capacityPct >= 80) {
    embed.setDescription(`**Warning:** Server is at ${capacityPct}% channel capacity (${guildChannels}/500).`);
  }

  await interaction.editReply({ embeds: [embed] });
}
