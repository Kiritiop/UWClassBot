import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  ComponentType,
} from 'discord.js';
import type { Command } from './index';
import { config } from '../config';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode, getCourseById } from '../db/queries/courses';
import { getSectionsByCourse, getSectionById } from '../db/queries/sections';
import { enrollUserInSection, parseCourseCode } from '../services/enrollmentService';
import { errorEmbed, successEmbed, sectionLabel } from '../utils/embeds';
import { logger } from '../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('enroll')
    .setDescription('Enroll in a course section')
    .addStringOption((o) =>
      o.setName('course_code').setDescription('e.g. CS 135').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName('section')
        .setDescription('e.g. LEC 001 (omit to pick from list)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const courseCodeRaw = interaction.options.getString('course_code', true);
    const sectionArg = interaction.options.getString('section');

    const term = await getCurrentTerm();
    if (!term) {
      await interaction.reply({
        embeds: [errorEmbed('No current term is configured. Ask an admin to run `/admin set-current-term`.')],
        ephemeral: true,
      });
      return;
    }

    const parsed = parseCourseCode(courseCodeRaw);
    if (!parsed) {
      await interaction.reply({
        embeds: [errorEmbed(`"${courseCodeRaw}" does not look like a valid course code (e.g. CS 135, MATH 135).`)],
        ephemeral: true,
      });
      return;
    }

    const course = await getCourseByCode(parsed.subject, parsed.catalogNumber, term.term_code);
    if (!course) {
      await interaction.reply({
        embeds: [errorEmbed(`${parsed.subject} ${parsed.catalogNumber} was not found in ${term.name}. Run \`/sections\` to browse available courses.`)],
        ephemeral: true,
      });
      return;
    }

    // If no section arg, show a select menu
    if (!sectionArg) {
      const sections = await getSectionsByCourse(course.id);
      if (sections.length === 0) {
        await interaction.reply({
          embeds: [errorEmbed(`No sections are available for ${course.subject} ${course.catalog_number} yet.`)],
          ephemeral: true,
        });
        return;
      }

      // Discord select menus max 25 options
      const options = sections.slice(0, 25).map((s) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${s.section_type} ${s.section_number}`)
          .setDescription(sectionLabel(s).slice(0, 100))
          .setValue(`${s.section_type}_${s.section_number}`),
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId(`enroll_section_${course.id}`)
        .setPlaceholder('Choose a section')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

      await interaction.reply({
        content: `Which section of **${course.subject} ${course.catalog_number}** do you want to enroll in?`,
        components: [row],
        ephemeral: true,
      });

      // Wait for select menu response (2 minute timeout)
      let selectInteraction: StringSelectMenuInteraction;
      try {
        const reply = await interaction.fetchReply();
        selectInteraction = await reply.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.customId === `enroll_section_${course.id}` && i.user.id === interaction.user.id,
          time: 120_000,
        });
      } catch {
        await interaction.editReply({ content: 'Enrollment timed out.', components: [] });
        return;
      }

      const [type, number] = selectInteraction.values[0].split('_');
      await handleEnroll(selectInteraction, course.subject, `${course.catalog_number}`, `${type} ${number}`, term.term_code, term.name);
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await handleEnroll(interaction, course.subject, course.catalog_number, sectionArg, term.term_code, term.name);
  },
};

async function handleEnroll(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  subject: string,
  catalogNumber: string,
  sectionArg: string,
  termCode: string,
  termName: string,
): Promise<void> {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id);

  // Find or create term category
  const { ChannelType } = await import('discord.js');
  const categoryName = termName;
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
  );
  if (!category) {
    category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
  }

  const result = await enrollUserInSection(
    guild,
    member,
    `${subject} ${catalogNumber}`,
    sectionArg,
    termCode,
    termName,
    category.id,
  );

  const courseStr = result.course
    ? `${result.course.subject} ${result.course.catalog_number}`
    : `${subject} ${catalogNumber}`;

  const reply = (embed: ReturnType<typeof errorEmbed>) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ embeds: [embed] });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
  };

  switch (result.status) {
    case 'course_not_found':
      await reply(errorEmbed(`Course not found in ${termName}.`));
      break;
    case 'section_not_found':
      await reply(errorEmbed(`Section "${sectionArg}" not found for ${courseStr}. Use \`/sections ${courseStr}\` to see available sections.`));
      break;
    case 'already_enrolled':
      await reply(errorEmbed(`You are already enrolled in ${courseStr} ${sectionArg}.`));
      break;
    case 'duplicate_type': {
      const type = result.section?.section_type ?? 'that type';
      await reply(errorEmbed(`You are already in a ${type} section for ${courseStr}. Unenroll from the other one first.`));
      break;
    }
    case 'waiting_list':
      await reply(successEmbed(
        `Added to waiting list for **${courseStr} ${sectionArg}**.\n` +
        `${result.enrolledCount}/${config.SECTION_THRESHOLD} students enrolled — channel opens at ${config.SECTION_THRESHOLD}. You will be notified when it opens.`,
      ));
      break;
    case 'enrolled':
      await reply(successEmbed(
        `Enrolled in **${courseStr} ${sectionArg}**! Check your channel list - you now have access to the section channel.`,
      ));
      break;
  }
}

export default command;
