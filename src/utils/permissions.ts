import {
  PermissionFlagsBits,
  type Guild,
  type Role,
  type GuildChannel,
} from 'discord.js';

export function everyoneDeniedView(guild: Guild) {
  return {
    id: guild.roles.everyone.id,
    deny: [PermissionFlagsBits.ViewChannel],
  };
}

export function roleAllowView(role: Role) {
  return {
    id: role.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreatePrivateThreads],
  };
}
