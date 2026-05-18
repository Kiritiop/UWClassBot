import {
  ChannelType,
  type Guild,
  type TextChannel,
  type Role,
} from 'discord.js';
import { pool } from '../db/pool';
import { getChannelByCourseId, getChannelBySectionId, insertChannel } from '../db/queries/channels';
import type { Course, Section } from '../types';
import {
  courseChannelName,
  sectionChannelName,
  courseRoleName,
  sectionRoleName,
  sectionLabel,
} from '../utils/embeds';
import { everyoneDeniedView, roleAllowView } from '../utils/permissions';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface EnsureChannelsResult {
  courseChannelId: string;
  courseRoleId: string;
  sectionChannelId: string | null; // null if below threshold (on waiting list)
  sectionRoleId: string;
  wasCreated: boolean;
}

export async function ensureCourseRole(guild: Guild, course: Course): Promise<Role> {
  const name = courseRoleName(course.subject, course.catalog_number);
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;

  const role = await guild.roles.create({ name, mentionable: false });
  logger.info({ roleId: role.id, name }, 'Created course role');
  return role;
}

export async function ensureSectionRole(
  guild: Guild,
  course: Course,
  section: Section,
): Promise<Role> {
  const name = sectionRoleName(
    course.subject,
    course.catalog_number,
    section.section_type,
    section.section_number,
  );
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;

  const role = await guild.roles.create({ name, mentionable: false });
  logger.info({ roleId: role.id, name }, 'Created section role');
  return role;
}

export async function ensureCourseChannel(
  guild: Guild,
  course: Course,
  courseRole: Role,
  categoryId: string,
): Promise<TextChannel> {
  const existing = await getChannelByCourseId(course.id, guild.id);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channel_id)
      ?? await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (ch) return ch as TextChannel;
    // Channel was deleted from Discord — remove stale DB record and recreate
    await pool.query('DELETE FROM discord_channels WHERE id = $1', [existing.id]);
  }

  const name = courseChannelName(course.subject, course.catalog_number);
  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [everyoneDeniedView(guild), roleAllowView(courseRole)],
    topic: `${course.subject} ${course.catalog_number} - ${course.title}`,
  });

  await insertChannel(course.id, null, ch.id, courseRole.id, guild.id);
  logger.info({ channelId: ch.id, name }, 'Created course channel');
  return ch as TextChannel;
}

export async function ensureSectionChannel(
  guild: Guild,
  course: Course,
  section: Section,
  sectionRole: Role,
  categoryId: string,
): Promise<TextChannel> {
  const existing = await getChannelBySectionId(section.id, guild.id);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channel_id)
      ?? await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (ch) return ch as TextChannel;
    // Channel was deleted from Discord — remove stale DB record and recreate
    await pool.query('DELETE FROM discord_channels WHERE id = $1', [existing.id]);
  }

  const name = sectionChannelName(
    course.subject,
    course.catalog_number,
    section.section_type,
    section.section_number,
  );
  const topic = sectionLabel(section);

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [everyoneDeniedView(guild), roleAllowView(sectionRole)],
    topic,
  });

  await insertChannel(course.id, section.id, ch.id, sectionRole.id, guild.id);
  logger.info({ channelId: ch.id, name }, 'Created section channel');
  return ch as TextChannel;
}
