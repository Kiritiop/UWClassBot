import type { Guild, GuildMember } from 'discord.js';
import { pool } from '../db/pool';
import { getCourseByCode } from '../db/queries/courses';
import { getSectionByTypeAndNumber, getSectionsByCourse } from '../db/queries/sections';
import { enrollUser, unenrollUser, isEnrolled, countEnrollmentsForSection } from '../db/queries/enrollments';
import { upsertUser } from '../db/queries/users';
import {
  ensureCourseRole,
  ensureSectionRole,
  ensureCourseChannel,
  ensureSectionChannel,
} from './channelManager';
import { getCurrentTerm } from '../db/queries/terms';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Course, Section } from '../types';

export interface EnrollResult {
  status:
    | 'enrolled'
    | 'already_enrolled'
    | 'waiting_list'
    | 'duplicate_type'
    | 'course_not_found'
    | 'section_not_found';
  course?: Course;
  section?: Section;
  enrolledCount?: number;
}

function parseCourseCode(raw: string): { subject: string; catalogNumber: string } | null {
  const match = raw.trim().toUpperCase().match(/^([A-Z]{2,5})\s*(\d{3}[A-Z]?)$/);
  if (!match) return null;
  return { subject: match[1], catalogNumber: match[2] };
}

function parseSectionArg(raw: string): { type: string; number: string } | null {
  const match = raw.trim().toUpperCase().match(/^(LEC|TUT|LAB|TST|SEM|RDG|PRJ)\s*(\d{3})$/);
  if (!match) return null;
  return { type: match[1], number: match[2] };
}

export async function enrollUserInSection(
  guild: Guild,
  member: GuildMember,
  courseCodeRaw: string,
  sectionArg: string | null,
  termCode: string,
  termName: string,
  categoryId: string,
): Promise<EnrollResult> {
  const parsed = parseCourseCode(courseCodeRaw);
  if (!parsed) return { status: 'course_not_found' };

  const course = await getCourseByCode(parsed.subject, parsed.catalogNumber, termCode);
  if (!course) return { status: 'course_not_found' };

  if (!sectionArg) {
    // Caller should show a section picker - not enrolling yet
    return { status: 'section_not_found', course };
  }

  const parsedSection = parseSectionArg(sectionArg);
  if (!parsedSection) return { status: 'section_not_found', course };

  const section = await getSectionByTypeAndNumber(
    course.id,
    parsedSection.type,
    parsedSection.number,
  );
  if (!section) return { status: 'section_not_found', course };

  // Guard: already enrolled
  await upsertUser(member.id);
  if (await isEnrolled(member.id, section.id)) {
    return { status: 'already_enrolled', course, section };
  }

  // Guard: already in a section of the same type for this course (e.g. two LEC sections)
  const allSections = await getSectionsByCourse(course.id);
  const samTypeSections = allSections.filter((s) => s.section_type === section.section_type);
  for (const s of samTypeSections) {
    if (s.id !== section.id && await isEnrolled(member.id, s.id)) {
      return { status: 'duplicate_type', course, section };
    }
  }

  // Ensure course-level role + channel
  const courseRole = await ensureCourseRole(guild, course);
  await ensureCourseChannel(guild, course, courseRole, categoryId);
  await member.roles.add(courseRole);

  // Ensure section-level role + check threshold
  const sectionRole = await ensureSectionRole(guild, course, section);
  await member.roles.add(sectionRole);

  const enrolledCount = await countEnrollmentsForSection(section.id);
  const threshold = config.SECTION_THRESHOLD;

  if (enrolledCount + 1 >= threshold) {
    await ensureSectionChannel(guild, course, section, sectionRole, categoryId);
    // If this enrollment exactly hit the threshold, notify waiting list users
    if (enrolledCount + 1 === threshold) {
      const waitingRes = await pool.query<{ user_id: string }>(
        'SELECT user_id FROM waiting_lists WHERE section_id = $1',
        [section.id],
      );
      for (const { user_id } of waitingRes.rows) {
        try {
          const discordUser = await guild.client.users.fetch(user_id);
          await discordUser.send(
            `The section channel for **${course.subject} ${course.catalog_number} ${section.section_type} ${section.section_number}** is now open! Check your Discord channel list.`,
          );
        } catch {
          // User has DMs disabled — skip silently
        }
      }
      await pool.query('DELETE FROM waiting_lists WHERE section_id = $1', [section.id]);
    }
  } else {
    // Below threshold - add to waiting list
    await pool.query(
      `INSERT INTO waiting_lists (user_id, section_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, section_id) DO NOTHING`,
      [member.id, section.id],
    );
  }

  await enrollUser(member.id, section.id);

  return {
    status: enrolledCount + 1 >= threshold ? 'enrolled' : 'waiting_list',
    course,
    section,
    enrolledCount: enrolledCount + 1,
  };
}

export { parseCourseCode, parseSectionArg };
