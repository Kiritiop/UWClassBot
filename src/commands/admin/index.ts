import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../index';
import { errorEmbed } from '../../utils/embeds';
import { getGuildConfig } from '../../db/queries/guildConfigs';
import { handleSyncCatalog } from './syncCatalog';
import { handleSetCurrentTerm } from './setCurrentTerm';
import { handleSetAdminRole } from './setAdminRole';
import { handleStats } from './stats';
import { handleAudit } from './audit';
import { handleForceArchive } from './forceArchive';
import { handleRunLeetcode } from './runLeetcode';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .addSubcommand((s) =>
      s.setName('sync-catalog').setDescription('Manually trigger UW API catalog sync'),
    )
    .addSubcommand((s) =>
      s
        .setName('force-archive')
        .setDescription('Archive all channels for a term immediately')
        .addStringOption((o) =>
          o.setName('term_code').setDescription('Term code e.g. 1269').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-current-term')
        .setDescription('Set the current term')
        .addStringOption((o) =>
          o.setName('term_code').setDescription('Term code e.g. 1269').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-admin-role')
        .setDescription('Set which role can use admin commands in this server')
        .addRoleOption((o) =>
          o.setName('role').setDescription('The admin role').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('audit')
        .setDescription("Show a user's enrollments")
        .addUserOption((o) => o.setName('user').setDescription('Discord user').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('stats').setDescription('Show server stats'))
    .addSubcommand((s) => s.setName('run-leetcode').setDescription('Manually trigger the LeetCode daily post now')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild!;
    const member = await guild.members.fetch(interaction.user.id);

    // set-admin-role requires Discord Administrator — it's the bootstrap command
    if (interaction.options.getSubcommand() === 'set-admin-role') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          embeds: [errorEmbed('Only server administrators can set the admin role.')],
          flags: MessageFlags.Ephemeral as number,
        });
        return;
      }
      return handleSetAdminRole(interaction);
    }

    // All other subcommands: check configured admin role, fall back to Administrator
    const guildConfig = await getGuildConfig(guild.id);
    const isAdmin = guildConfig?.admin_role_id
      ? member.roles.cache.has(guildConfig.admin_role_id)
      : member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      await interaction.reply({
        embeds: [errorEmbed('You do not have permission to use admin commands.')],
        flags: MessageFlags.Ephemeral as number,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'sync-catalog': return handleSyncCatalog(interaction);
      case 'force-archive': return handleForceArchive(interaction);
      case 'set-current-term': return handleSetCurrentTerm(interaction);
      case 'audit': return handleAudit(interaction);
      case 'stats': return handleStats(interaction);
      case 'run-leetcode': return handleRunLeetcode(interaction);
      default:
        await interaction.reply({ embeds: [errorEmbed(`Unknown subcommand: ${sub}`)], flags: MessageFlags.Ephemeral as number });
    }
  },
};

export default command;
