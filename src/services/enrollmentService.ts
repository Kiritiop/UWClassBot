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

// Bounds how many distinct courses one user can hold at once, so a single member
// can't spawn unbounded roles/channels toward Discord's per-guild limits.
const MAX_COURSES_PER_USER = 12;

export interface EnrollResult {
  status:
    | 'enrolled'
    | 'already_enrolled'
    | 'waiting_list'
    | 'duplicate_type'
    | 'course_not_found'
    | 'section_not_found'
    | 'enrollment_limit';
  course?: Course;
  section?: Section;
  enrolledCount?: number;
}

function parseCourseCode(raw: string): { subject: string; catalogNumber: string } | null {
  // Catalog numbers aren't always 3 digits + 1 letter: COOP/PD/SEQ use bare 1-2 digit
  // numbers, and WLU cross-listed courses (e.g. BUS 461AW, ECE 6606PD) use up to 2 trailing letters.
  const match = raw.trim().toUpperCase().match(/^([A-Z]{2,6})\s*(\d{1,4}[A-Z]{0,2})$/);
  if (!match) return null;
  return { subject: match[1], catalogNumber: match[2] };
}

function parseSectionArg(raw: string): { type: string; number: string } | null {
  // Section types are always a 3-letter code (LEC, TUT, WSP, PRA, ...) - UW adds new ones
  // over time, so match the shape rather than hardcoding an enum that goes stale.
  const match = raw.trim().toUpperCase().match(/^([A-Z]{3})\s*(\d{3})$/);
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

  // Enforce the per-user course cap before creating any roles/channels.
  // Adding another section of a course the user is already in doesn't count.
  const alreadyInCourse = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM enrollments e
       JOIN sections s ON s.id = e.section_id
       WHERE e.user_id = $1 AND e.active = TRUE AND s.course_id = $2
     ) AS exists`,
    [member.id, course.id],
  );
  if (!alreadyInCourse.rows[0].exists) {
    const distinctCourses = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT s.course_id) AS count
       FROM enrollments e
       JOIN sections s ON s.id = e.section_id
       WHERE e.user_id = $1 AND e.active = TRUE`,
      [member.id],
    );
    if (parseInt(distinctCourses.rows[0].count, 10) >= MAX_COURSES_PER_USER) {
      return { status: 'enrollment_limit', course, section };
    }
  }

  // Ensure course-level role + channel
  const courseRole = await ensureCourseRole(guild, course);
  await ensureCourseChannel(guild, course, courseRole, categoryId);
  await member.roles.add(courseRole);

  // Ensure section-level role + check threshold
  const sectionRole = await ensureSectionRole(guild, course, section);
  await member.roles.add(sectionRole);

  // Enroll first so the count includes this user
  await enrollUser(member.id, section.id);

  const enrolledCount = await countEnrollmentsForSection(section.id);
  const threshold = config.SECTION_THRESHOLD;

  if (enrolledCount >= threshold) {
    await ensureSectionChannel(guild, course, section, sectionRole, categoryId);
    // Exactly hit the threshold — notify waiting list users
    if (enrolledCount === threshold) {
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

  return {
    status: enrolledCount >= threshold ? 'enrolled' : 'waiting_list',
    course,
    section,
    enrolledCount,
  };
}

export { parseCourseCode, parseSectionArg };
