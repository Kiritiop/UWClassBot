import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode } from '../db/queries/courses';
import { getSectionsByCourse, getSectionByTypeAndNumber } from '../db/queries/sections';
import { unenrollUser, isEnrolled, getActiveEnrollments } from '../db/queries/enrollments';
import { parseCourseCode, parseSectionArg } from '../services/enrollmentService';
import { errorEmbed, successEmbed, courseRoleName, sectionRoleName } from '../utils/embeds';
import { pool } from '../db/pool';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unenroll')
    .setDescription('Remove yourself from a course or section')
    .addStringOption((o) =>
      o.setName('course_code').setDescription('e.g. CS 135').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName('section')
        .setDescription('e.g. LEC 001 (omit to remove all sections of this course)')
        .setRequired(false)
        .setAutocomplete(true),
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
      await interaction.editReply({ embeds: [errorEmbed(`${parsed.subject} ${parsed.catalogNumber} not found in ${term.name}.`)] });
      return;
    }

    const guild = interaction.guild!;
    const member = await guild.members.fetch(interaction.user.id);

    // Remove role from member; if nobody holds it anymore, delete the channel and role too.
    // Use DB enrollment counts rather than role.members — the cache is unreliable after
    // bot restarts or in servers where members aren't fully cached.
    const removeRoleByName = async (name: string) => {
      const role = guild.roles.cache.find((r) => r.name === name);
      if (!role) return;
      await member.roles.remove(role).catch(() => null);

      // Find what course/section this role covers, then count remaining active enrollments.
      const channelRow = await pool.query<{ course_id: number; section_id: number | null }>(
        'SELECT course_id, section_id FROM discord_channels WHERE role_id = $1 AND guild_id = $2 LIMIT 1',
        [role.id, guild.id],
      );
      const row = channelRow.rows[0];
      let holderCount = 0;
      if (row) {
        const countRes = await pool.query<{ count: string }>(
          row.section_id != null
            ? 'SELECT COUNT(*) AS count FROM enrollments WHERE section_id = $1 AND active = TRUE'
            : `SELECT COUNT(*) AS count FROM enrollments e
               JOIN sections s ON s.id = e.section_id
               WHERE s.course_id = $1 AND e.active = TRUE`,
          [row.section_id ?? row.course_id],
        );
        holderCount = parseInt(countRes.rows[0].count, 10);
      }

      // Also handle section roles that have no channel yet (below threshold)
      // In that case there's no discord_channels row, but we still need to check enrollments.
      // We do this by looking up the section via the role name directly from the guild role cache —
      // if there's no DB row at all, nobody else can hold the role, so holderCount stays 0.

      if (holderCount === 0) {
        const channelRes = await pool.query<{ channel_id: string; id: number }>(
          'SELECT channel_id, id FROM discord_channels WHERE role_id = $1 AND guild_id = $2',
          [role.id, guild.id],
        );
        for (const { channel_id, id } of channelRes.rows) {
          const ch = guild.channels.cache.get(channel_id)
            ?? await guild.channels.fetch(channel_id).catch(() => null);
          if (ch) await ch.delete('No enrolled members').catch(() => null);
          await pool.query('DELETE FROM discord_channels WHERE id = $1', [id]);
        }
        await role.delete('No enrolled members').catch(() => null);
      }
    };

    if (sectionArg) {
      const parsedSec = parseSectionArg(sectionArg);
      if (!parsedSec) {
        await interaction.editReply({ embeds: [errorEmbed(`"${sectionArg}" is not a valid section (e.g. LEC 001).`)] });
        return;
      }

      const section = await getSectionByTypeAndNumber(course.id, parsedSec.type, parsedSec.number);
      if (!section || !(await isEnrolled(interaction.user.id, section.id))) {
        await interaction.editReply({
          embeds: [errorEmbed(`You are not enrolled in ${course.subject} ${course.catalog_number} ${sectionArg}.`)],
        });
        return;
      }

      await unenrollUser(interaction.user.id, section.id);
      await pool.query('DELETE FROM waiting_lists WHERE user_id = $1 AND section_id = $2', [interaction.user.id, section.id]);

      // Remove section role by name (exists even if no channel was created yet)
      await removeRoleByName(sectionRoleName(course.subject, course.catalog_number, section.section_type, section.section_number));

      // Remove course role if no other sections of this course remain
      const remaining = await getActiveEnrollments(interaction.user.id);
      const allSections = await getSectionsByCourse(course.id);
      const stillInCourse = remaining.some((e) => allSections.some((s) => s.id === e.section_id));
      if (!stillInCourse) {
        await removeRoleByName(courseRoleName(course.subject, course.catalog_number));
      }

      await interaction.editReply({
        embeds: [successEmbed(`Unenrolled from **${course.subject} ${course.catalog_number} ${sectionArg}**.`)],
      });
    } else {
      const allSections = await getSectionsByCourse(course.id);
      const enrollments = await getActiveEnrollments(interaction.user.id);
      const enrolledSections = allSections.filter((s) => enrollments.some((e) => e.section_id === s.id));

      if (enrolledSections.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(`You are not enrolled in any section of ${course.subject} ${course.catalog_number}.`)],
        });
        return;
      }

      for (const section of enrolledSections) {
        await unenrollUser(interaction.user.id, section.id);
        await pool.query('DELETE FROM waiting_lists WHERE user_id = $1 AND section_id = $2', [interaction.user.id, section.id]);
        await removeRoleByName(sectionRoleName(course.subject, course.catalog_number, section.section_type, section.section_number));
      }

      await removeRoleByName(courseRoleName(course.subject, course.catalog_number));

      await interaction.editReply({
        embeds: [successEmbed(`Unenrolled from all sections of **${course.subject} ${course.catalog_number}**.`)],
      });
    }
  },
};

export default command;
