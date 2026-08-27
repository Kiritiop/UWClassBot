import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Colors,
  ChannelType,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { Command } from './index';
import { config } from '../config';
import { getCurrentTerm } from '../db/queries/terms';
import { getCourseByCode } from '../db/queries/courses';
import { getSectionByTypeAndNumber } from '../db/queries/sections';
import { isEnrolled } from '../db/queries/enrollments';
import { enrollUserInSection } from '../services/enrollmentService';
import { parseQuestSchedule } from '../services/questParser';
import { errorEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';
import type { Course, Section } from '../types';

// Quest lists exam sittings (TST) and co-op placeholders (WRK) alongside real classes.
// Only components that meet weekly with a stable roster are worth a role and a channel.
const ENROLLABLE_COMPONENTS = new Set(['LEC', 'TUT']);

// The student has to tab over to Quest, switch views and copy, so give them room.
const COLLECTOR_TIMEOUT_MS = 10 * 60 * 1000;

// Keeps a single embed field under Discord's 1024-character cap.
const MAX_LIST_ITEMS = 15;

// Discord's hard cap on a modal text input.
const MODAL_MAX_LENGTH = 4000;

interface PlannedEnrollment {
  course: Course;
  section: Section;
  meeting: string | null;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('enrollall')
    .setDescription('Paste your whole Quest schedule and get enrolled in every class at once'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Run this in a server, not in a DM.')],
        flags: MessageFlags.Ephemeral as number,
      });
      return;
    }

    const term = await getCurrentTerm();
    if (!term) {
      await interaction.reply({
        embeds: [errorEmbed('No current term is configured. Ask an admin to run `/admin set-current-term`.')],
        flags: MessageFlags.Ephemeral as number,
      });
      return;
    }

    const nonce = `${interaction.user.id}_${Date.now()}`;
    const goButton = new ButtonBuilder()
      .setCustomId(`enrollall_go_${nonce}`)
      .setLabel('GO!')
      .setStyle(ButtonStyle.Success);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(`Bulk enroll - ${term.name}`)
          .setDescription(
            '**1.** Open Quest and go to **Enroll → My Class Schedule**.\n' +
            '**2.** Switch to **List View**.\n' +
            '**3.** Select the whole page, copy it, then hit **GO!** and paste it in.\n\n' +
            'Do not bother cleaning it up. Menus, headers and exam rows are filtered out for you.',
          ),
      ],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(goButton)],
      flags: MessageFlags.Ephemeral as number,
    });

    const prompt = await interaction.fetchReply();
    let goInteraction;
    try {
      goInteraction = await prompt.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.customId === `enrollall_go_${nonce}` && i.user.id === interaction.user.id,
        time: COLLECTOR_TIMEOUT_MS,
      });
    } catch {
      await interaction.editReply({ content: 'Bulk enroll timed out.', embeds: [], components: [] }).catch(() => null);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`enrollall_modal_${nonce}`)
      .setTitle('Paste your Quest schedule')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('schedule')
            .setLabel('Quest → My Class Schedule → List View')
            .setPlaceholder('Select the whole page, copy, paste here. Extra text is fine.')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(MODAL_MAX_LENGTH)
            .setRequired(true),
        ),
      );
    await goInteraction.showModal(modal);
    // Drop the button so a second click can't open a competing modal.
    await interaction.editReply({ components: [] }).catch(() => null);

    let modalInteraction: ModalSubmitInteraction;
    try {
      modalInteraction = await goInteraction.awaitModalSubmit({
        filter: (i) => i.customId === `enrollall_modal_${nonce}` && i.user.id === interaction.user.id,
        time: COLLECTOR_TIMEOUT_MS,
      });
    } catch {
      return; // Student closed the modal or ran out of time, nothing to clean up.
    }

    await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral as number });
    try {
      await review(modalInteraction, interaction.guild, term.term_code, term.name, nonce);
    } catch (err) {
      logger.error({ err, userId: interaction.user.id }, 'Bulk enroll failed');
      await modalInteraction
        .editReply({ content: null, embeds: [errorEmbed('Something went wrong. Please try again.')], components: [] })
        .catch(() => null);
    }
  },
};

async function review(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  termCode: string,
  termName: string,
  nonce: string,
): Promise<void> {
  const raw = interaction.fields.getTextInputValue('schedule');
  const parsed = parseQuestSchedule(raw);
  // Discord silently truncates at the input's max length, which can lop off whole
  // courses from the end of a long schedule.
  const maybeTruncated = raw.length >= MODAL_MAX_LENGTH - 100;

  if (parsed.length === 0) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'No classes found in that paste. Make sure you are on **My Class Schedule** in **List View** ' +
          'and that you copied the whole page, then try `/enrollall` again.',
        ),
      ],
    });
    return;
  }

  const plan: PlannedEnrollment[] = [];
  const already: string[] = [];
  const notInCatalog: string[] = [];
  const ignored: string[] = [];
  const noRows: string[] = [];

  for (const parsedCourse of parsed) {
    const code = `${parsedCourse.subject} ${parsedCourse.catalogNumber}`;

    if (parsedCourse.sections.length === 0) {
      noRows.push(code);
      continue;
    }

    const course = await getCourseByCode(parsedCourse.subject, parsedCourse.catalogNumber, termCode);
    if (!course) {
      notInCatalog.push(code);
      continue;
    }

    for (const parsedSection of parsedCourse.sections) {
      const label = `${code} ${parsedSection.sectionType} ${parsedSection.sectionNumber}`;

      if (!ENROLLABLE_COMPONENTS.has(parsedSection.sectionType)) {
        ignored.push(label);
        continue;
      }

      const section = await getSectionByTypeAndNumber(
        course.id,
        parsedSection.sectionType,
        parsedSection.sectionNumber,
      );
      if (!section) {
        notInCatalog.push(label);
        continue;
      }

      if (await isEnrolled(interaction.user.id, section.id)) {
        already.push(label);
        continue;
      }

      plan.push({ course, section, meeting: parsedSection.meeting });
    }
  }

  const embed = new EmbedBuilder()
    .setColor(plan.length > 0 ? Colors.Blurple : Colors.Orange)
    .setTitle(`Found ${parsed.length} ${parsed.length === 1 ? 'course' : 'courses'} - ${termName}`);

  if (plan.length > 0) {
    embed.addFields({
      name: `Will enroll you in ${plan.length} ${plan.length === 1 ? 'section' : 'sections'}`,
      value: list(plan.map(describe)),
    });
  }
  if (already.length > 0) {
    embed.addFields({ name: 'Already enrolled', value: list(already) });
  }
  if (notInCatalog.length > 0) {
    embed.addFields({
      name: `Not in the ${termName} catalog`,
      value: list(notInCatalog),
    });
  }
  if (ignored.length > 0) {
    embed.addFields({
      name: 'Ignored (only lectures and tutorials get channels)',
      value: list(ignored),
    });
  }
  if (noRows.length > 0) {
    embed.addFields({
      name: 'No class rows found (paste may have been cut off)',
      value: list(noRows),
    });
  }
  if (maybeTruncated) {
    embed.setFooter({
      text: 'That paste hit the size limit, so the last course or two may be missing. ' +
        'Run /enrollall again with the rest and it will pick up where this left off.',
    });
  }

  if (plan.length === 0) {
    embed.setDescription('Nothing left to enroll you in.');
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`enrollall_confirm_${nonce}`)
      .setLabel(`Enroll in ${plan.length}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`enrollall_cancel_${nonce}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [confirmRow] });

  const message = await interaction.fetchReply();
  let choice;
  try {
    choice = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        (i.customId === `enrollall_confirm_${nonce}` || i.customId === `enrollall_cancel_${nonce}`) &&
        i.user.id === interaction.user.id,
      time: COLLECTOR_TIMEOUT_MS,
    });
  } catch {
    await interaction.editReply({ components: [] }).catch(() => null);
    return;
  }

  await choice.deferUpdate();
  if (choice.customId === `enrollall_cancel_${nonce}`) {
    await interaction.editReply({ content: 'Cancelled. Nothing changed.', embeds: [], components: [] });
    return;
  }

  await interaction.editReply({
    content: `Enrolling you in ${plan.length} sections, this takes a moment...`,
    embeds: [],
    components: [],
  });

  const member = await guild.members.fetch(interaction.user.id);
  await runEnrollments(interaction, guild, member, plan, termCode, termName);
}

async function runEnrollments(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  member: GuildMember,
  plan: PlannedEnrollment[],
  termCode: string,
  termName: string,
): Promise<void> {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === termName,
  );
  if (!category) {
    category = await guild.channels.create({ name: termName, type: ChannelType.GuildCategory });
  }

  const enrolled: string[] = [];
  const waiting: string[] = [];
  const failed: string[] = [];

  // Sequential on purpose: each enrollment may create a role and a channel, and
  // discord.js queues those behind the same rate limit buckets anyway.
  for (const item of plan) {
    const code = `${item.course.subject} ${item.course.catalog_number}`;
    const label = `${code} ${item.section.section_type} ${item.section.section_number}`;
    try {
      const result = await enrollUserInSection(
        guild,
        member,
        code,
        `${item.section.section_type} ${item.section.section_number}`,
        termCode,
        termName,
        category.id,
      );
      switch (result.status) {
        case 'enrolled':
          enrolled.push(label);
          break;
        case 'waiting_list':
          waiting.push(`${label} (${result.enrolledCount ?? 0}/${config.SECTION_THRESHOLD})`);
          break;
        case 'already_enrolled':
          enrolled.push(label);
          break;
        case 'duplicate_type':
          failed.push(`${label} - you are already in another ${item.section.section_type} for ${code}`);
          break;
        case 'enrollment_limit':
          failed.push(`${label} - course limit reached`);
          break;
        default:
          failed.push(`${label} - not found in ${termName}`);
      }
    } catch (err) {
      logger.error({ err, label, userId: member.id }, 'Bulk enroll failed for one section');
      failed.push(`${label} - something went wrong`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(failed.length > 0 ? Colors.Orange : Colors.Green)
    .setTitle(`Bulk enroll done - ${termName}`);

  if (enrolled.length > 0) {
    embed.addFields({ name: `Enrolled (${enrolled.length})`, value: list(enrolled) });
  }
  if (waiting.length > 0) {
    embed.addFields({
      name: `Waiting list (${waiting.length})`,
      value:
        `Channels open at ${config.SECTION_THRESHOLD} students. You will be DMed when they do.\n` +
        list(waiting),
    });
  }
  if (failed.length > 0) {
    embed.addFields({ name: `Skipped (${failed.length})`, value: list(failed) });
  }
  if (enrolled.length === 0 && waiting.length === 0) {
    embed.setDescription('Nothing was enrolled.');
  }

  await interaction.editReply({ content: null, embeds: [embed], components: [] });
}

function describe(item: PlannedEnrollment): string {
  const label =
    `${item.course.subject} ${item.course.catalog_number} ` +
    `${item.section.section_type} ${item.section.section_number}`;
  return item.meeting ? `${label} - ${item.meeting}` : label;
}

function list(items: string[]): string {
  const shown = items.slice(0, MAX_LIST_ITEMS);
  const rest = items.length - shown.length;
  const text = shown.join('\n') + (rest > 0 ? `\n...and ${rest} more` : '');
  return text.slice(0, 1024);
}

export default command;
