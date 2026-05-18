import { SlashCommandBuilder, EmbedBuilder, Colors, ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode } from '../db/queries/courses';
import { getActiveEnrollments } from '../db/queries/enrollments';
import { getSectionsByCourse } from '../db/queries/sections';
import { getChannelByCourseId } from '../db/queries/channels';
import { parseCourseCode } from '../services/enrollmentService';
import { errorEmbed } from '../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('anonymous')
    .setDescription('Post an anonymous question to a course channel')
    .addStringOption((o) =>
      o.setName('course_code').setDescription('e.g. CS 135').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName('message').setDescription('Your anonymous question or message').setRequired(true).setMaxLength(1000),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const courseCodeRaw = interaction.options.getString('course_code', true);
    const message = interaction.options.getString('message', true).trim();

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

    // Must be enrolled in the course to post anonymously (prevents spam)
    const enrollments = await getActiveEnrollments(interaction.user.id);
    const courseSections = await getSectionsByCourse(course.id);
    const isEnrolledInCourse = enrollments.some((e) => courseSections.some((s) => s.id === e.section_id));
    if (!isEnrolledInCourse) {
      await interaction.editReply({
        embeds: [errorEmbed(`You must be enrolled in ${course.subject} ${course.catalog_number} to post anonymously.`)],
      });
      return;
    }

    const guild = interaction.guild!;
    const channelRecord = await getChannelByCourseId(course.id, guild.id);
    if (!channelRecord) {
      await interaction.editReply({
        embeds: [errorEmbed(`No channel exists for ${course.subject} ${course.catalog_number} yet. Enroll first to create it.`)],
      });
      return;
    }

    const channel = (guild.channels.cache.get(channelRecord.channel_id)
      ?? await guild.channels.fetch(channelRecord.channel_id).catch(() => null)) as TextChannel | null;
    if (!channel) {
      await interaction.editReply({ embeds: [errorEmbed('Could not find the course channel. Try again later.')] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setAuthor({ name: 'Anonymous' })
      .setDescription(message)
      .setFooter({ text: `${course.subject} ${course.catalog_number} · ${term.name}` })
      .setTimestamp();

    const posted = await channel.send({ embeds: [embed] });

    // Create a thread so people can answer without cluttering the channel
    await posted.startThread({
      name: `Anonymous Q: ${message.slice(0, 80)}${message.length > 80 ? '…' : ''}`,
      autoArchiveDuration: 1440, // 24 hours
    }).catch(() => null);

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription(`Your anonymous message was posted to <#${channel.id}>.`),
    ]});
  },
};

export default command;
