import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  ChannelType,
  type ChatInputCommandInteraction,
  type DMChannel,
} from 'discord.js';
import type { Command } from './index';
import { getCurrentTerm } from '../db/queries/terms';
import { upsertUser, updateUserProfile } from '../db/queries/users';
import { enrollUserInSection } from '../services/enrollmentService';
import { errorEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

interface ParsedSection {
  subject: string;
  catalogNumber: string;
  sectionType: string;
  sectionNumber: string;
}

function parseScheduleText(text: string): ParsedSection[] {
  const sectionTypes = 'LEC|TUT|LAB|TST|SEM|RDG|PRJ';
  const regex = new RegExp(`([A-Z]{2,5})\\s+(\\d{3}[A-Z]?)\\s+(${sectionTypes})\\s*(\\d{3})`, 'g');
  const upper = text.toUpperCase();
  const results: ParsedSection[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = regex.exec(upper)) !== null) {
    const [, subject, catalogNumber, sectionType, sectionNumber] = match;
    const key = `${subject}_${catalogNumber}_${sectionType}_${sectionNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ subject, catalogNumber, sectionType, sectionNumber });
    }
  }
  return results;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up your profile and enroll in your courses (runs in DM)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const term = await getCurrentTerm();
    if (!term) {
      await interaction.reply({
        embeds: [errorEmbed('No current term is configured. Ask an admin to run `/admin set-current-term`.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: 'Check your DMs! I\'ve sent you the setup wizard.', ephemeral: true });

    // Open DM channel
    let dmChannel: DMChannel;
    try {
      dmChannel = await interaction.user.createDM();
    } catch {
      await interaction.editReply({ content: 'I couldn\'t open a DM with you. Enable DMs from server members and try `/setup` again.' });
      return;
    }

    // --- Step 1: Privacy ---
    const privacyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_privacy_handle_only')
        .setLabel('Handle only (@username)')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('setup_privacy_show_name')
        .setLabel('Show full name')
        .setStyle(ButtonStyle.Primary),
    );

    let privacyMsg;
    try {
      privacyMsg = await dmChannel.send({
        content:
          '**ClassMatch Setup — Step 1 of 3: Privacy**\n\n' +
          'How should classmates see you in `/classmates`?\n\n' +
          '• **Handle only** — classmates see `@yourusername`\n' +
          '• **Show full name** — classmates see your real display name',
        components: [privacyRow],
      });
    } catch {
      await interaction.editReply({ content: 'I couldn\'t send you a DM. Enable DMs from server members and try `/setup` again.' });
      return;
    }

    let privacyInteraction;
    try {
      privacyInteraction = await privacyMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 300_000,
      });
    } catch {
      await dmChannel.send('Setup timed out. Run `/setup` in the server to restart.');
      return;
    }

    const privacySetting = privacyInteraction.customId === 'setup_privacy_show_name' ? 'show_name' : 'handle_only';

    // --- Step 2: Program + year modal ---
    const modal = new ModalBuilder()
      .setCustomId('setup_profile_modal')
      .setTitle('ClassMatch — Your Profile')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('setup_program')
            .setLabel('Program (e.g. Computer Science, SE)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('setup_year')
            .setLabel('Year level (e.g. 1A, 2B, 4th year)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20),
        ),
      );

    await privacyInteraction.showModal(modal);
    await privacyMsg.edit({ components: [] }).catch(() => undefined);

    let modalInteraction;
    try {
      modalInteraction = await privacyInteraction.awaitModalSubmit({
        filter: (i) => i.customId === 'setup_profile_modal' && i.user.id === interaction.user.id,
        time: 600_000,
      });
    } catch {
      await dmChannel.send('Setup timed out. Run `/setup` in the server to restart.');
      return;
    }

    const program = modalInteraction.fields.getTextInputValue('setup_program').trim();
    const yearLevel = modalInteraction.fields.getTextInputValue('setup_year').trim();

    await upsertUser(interaction.user.id);
    await updateUserProfile(interaction.user.id, { privacy_setting: privacySetting, program, year_level: yearLevel });

    await modalInteraction.reply({
      content:
        'Profile saved!\n' +
        `Privacy: **${privacySetting === 'show_name' ? 'Show full name' : 'Handle only'}**\n` +
        `Program: **${program}** | Year: **${yearLevel}**`,
    });

    // --- Step 3: Schedule paste ---
    await dmChannel.send({
      content:
        `**ClassMatch Setup — Step 3 of 3: Your Schedule**\n\n` +
        `Paste your class schedule from **UW Quest** and I'll enroll you automatically.\n\n` +
        `Go to Quest → **Class Schedule** → select **${term.name}** → copy all text and paste it here.\n\n` +
        `_Type \`skip\` to skip and use \`/enroll\` in the server instead._`,
    });

    const collected = await dmChannel.awaitMessages({
      filter: (m) => m.author.id === interaction.user.id,
      max: 1,
      time: 600_000,
      errors: ['time'],
    }).catch(() => null);

    const scheduleText = collected?.first()?.content;

    if (!scheduleText || scheduleText.toLowerCase().trim() === 'skip') {
      await dmChannel.send(
        'No problem! Use `/enroll <course code>` in the server to add classes.\n\n**Setup complete!**',
      );
      return;
    }

    const parsedSections = parseScheduleText(scheduleText);
    if (parsedSections.length === 0) {
      await dmChannel.send(
        "I couldn't find any course sections in that text. " +
        'Make sure to copy from Quest → Class Schedule. Use `/enroll` in the server to add sections manually.\n\n**Setup complete!**',
      );
      return;
    }

    // Find or create term category in guild
    const guild = interaction.guild!;
    const categoryName = term.name;
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
    );
    if (!category) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
    }

    const enrolled: string[] = [];
    const waiting: string[] = [];
    const failed: string[] = [];

    for (const s of parsedSections) {
      try {
        const member = await guild.members.fetch(interaction.user.id);
        const result = await enrollUserInSection(
          guild,
          member,
          `${s.subject} ${s.catalogNumber}`,
          `${s.sectionType} ${s.sectionNumber}`,
          term.term_code,
          term.name,
          category.id,
        );
        const label = `${s.subject} ${s.catalogNumber} ${s.sectionType} ${s.sectionNumber}`;
        if (result.status === 'enrolled' || result.status === 'already_enrolled') enrolled.push(label);
        else if (result.status === 'waiting_list') waiting.push(label);
        else failed.push(label);
      } catch (err) {
        logger.warn({ err, ...s }, 'Setup: failed to enroll section');
        failed.push(`${s.subject} ${s.catalogNumber} ${s.sectionType} ${s.sectionNumber}`);
      }
    }

    const lines: string[] = [];
    if (enrolled.length) lines.push(`**Enrolled:** ${enrolled.join(', ')}`);
    if (waiting.length) lines.push(`**Waiting list** (channel opens once enough students join): ${waiting.join(', ')}`);
    if (failed.length) lines.push(`**Not found** — use \`/enroll\` in the server: ${failed.join(', ')}`);

    await dmChannel.send(
      `**Setup complete!**\n\n${lines.join('\n')}\n\n` +
      'Use `/enroll`, `/unenroll`, and `/myclasses` in the server anytime.',
    );
  },
};

export default command;
