import { uwGet } from './client';
import {
  UWCoursesResponseSchema,
  UWSectionsResponseSchema,
  UWTermsResponseSchema,
  type UWCourse,
  type UWSection,
} from './schemas';
import { upsertCourse } from '../db/queries/courses';
import { upsertSection } from '../db/queries/sections';
import { upsertTerm } from '../db/queries/terms';
import { config } from '../config';
import { logger } from '../utils/logger';

const SECTION_FETCH_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSectionNumber(num: number): string {
  return String(num).padStart(3, '0');
}

function extractDays(section: UWSection): string | null {
  return section.scheduleData?.[0]?.classMeetingDayPatternCode ?? null;
}

function extractTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.slice(0, 5);
}

function extractInstructor(section: UWSection): string | null {
  if (!section.instructorData?.length) return null;
  const primary =
    section.instructorData.find((i) => i.instructorRoleCode === 'PI') ??
    section.instructorData[0];
  return primary?.displayName ?? null;
}

function extractLocation(section: UWSection): string | null {
  const entry = section.scheduleData?.[0];
  if (!entry?.buildingCode) return null;
  return entry.roomNumber ? `${entry.buildingCode} ${entry.roomNumber}` : entry.buildingCode;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

async function ensureTermExists(termCode: string): Promise<void> {
  let rawTerms: unknown;
  try {
    rawTerms = await uwGet('/v3/Terms');
  } catch (err) {
    logger.error({ err }, 'Failed to fetch terms from UW API');
    throw err;
  }

  const parsed = UWTermsResponseSchema.safeParse(rawTerms);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, 'Terms response failed zod validation');
    throw new Error('Terms validation failed');
  }

  const term = parsed.data.find((t) => t.termCode === termCode);
  if (!term) {
    throw new Error(`Term ${termCode} not found in UW API terms list`);
  }

  // UW API gives us begin/end dates. Exam end ≈ term end (API has no exam date).
  // Archive and delete are computed from config.
  const examEnd = new Date(term.termEndDate);
  const archiveDate = addDays(term.termEndDate, config.ARCHIVE_DAYS_AFTER_EXAMS);
  const deleteDate = addDays(
    archiveDate.toISOString(),
    config.DELETE_DAYS_AFTER_ARCHIVE,
  );

  await upsertTerm({
    term_code: term.termCode,
    name: term.name,
    start_date: new Date(term.termBeginDate),
    end_date: new Date(term.termEndDate),
    exam_end_date: examEnd,
    archive_date: archiveDate,
    delete_date: deleteDate,
  });

  logger.info({ termCode, name: term.name }, 'Term upserted');
}

export async function syncTerm(termCode: string): Promise<void> {
  logger.info({ termCode }, 'Starting catalog sync');

  // 1. Ensure the term row exists (courses FK depends on it)
  await ensureTermExists(termCode);

  // 2. Fetch all courses for the term
  let rawCourses: unknown;
  try {
    rawCourses = await uwGet(`/v3/Courses/${termCode}`);
  } catch (err) {
    logger.error({ err, termCode }, 'Failed to fetch courses from UW API; aborting sync');
    return;
  }

  const coursesResult = UWCoursesResponseSchema.safeParse(rawCourses);
  if (!coursesResult.success) {
    logger.error({ issues: coursesResult.error.issues }, 'Courses response failed zod validation');
    return;
  }

  const courses = coursesResult.data;
  logger.info({ termCode, count: courses.length }, 'Fetched courses from UW API');

  // De-duplicate: one row per (subject, catalogNumber) - take first occurrence
  const seen = new Set<string>();
  const uniqueCourses: UWCourse[] = [];
  for (const c of courses) {
    const key = `${c.subjectCode}|${c.catalogNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCourses.push(c);
    }
  }

  let coursesUpserted = 0;
  let sectionsUpserted = 0;
  let sectionErrors = 0;

  for (const course of uniqueCourses) {
    const courseId = await upsertCourse(
      course.subjectCode,
      course.catalogNumber,
      course.title,
      course.description ?? null,
      termCode,
    );
    coursesUpserted++;

    // 3. Fetch sections for this course (throttled to avoid 429s)
    await sleep(SECTION_FETCH_DELAY_MS);
    let rawSections: unknown;
    try {
      rawSections = await uwGet(
        `/v3/ClassSchedules/${termCode}/${course.subjectCode}/${course.catalogNumber}`,
      );
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      // 404 = no sections scheduled yet; 400 = invalid/placeholder catalog number (e.g. "3XX")
      if (status !== 404 && status !== 400) {
        logger.warn(
          { status, subject: course.subjectCode, catalogNumber: course.catalogNumber },
          'Failed to fetch sections',
        );
        sectionErrors++;
      }
      continue;
    }

    const sectionsResult = UWSectionsResponseSchema.safeParse(rawSections);
    if (!sectionsResult.success) {
      logger.error(
        {
          issues: sectionsResult.error.issues,
          subject: course.subjectCode,
          catalogNumber: course.catalogNumber,
        },
        'Sections response failed zod validation',
      );
      sectionErrors++;
      continue;
    }

    for (const section of sectionsResult.data) {
      // Skip PCS (correspondence/online) and other non-standard sessions
      const raw = section as { sessionCode?: string };
      if (raw.sessionCode && raw.sessionCode !== '1') continue;

      await upsertSection(
        courseId,
        section.courseComponent,
        formatSectionNumber(section.classSection),
        extractInstructor(section),
        extractDays(section),
        extractTime(section.scheduleData?.[0]?.classMeetingStartTime),
        extractTime(section.scheduleData?.[0]?.classMeetingEndTime),
        extractLocation(section),
        section.classNumber,
      );
      sectionsUpserted++;
    }
  }

  logger.info(
    { termCode, coursesUpserted, sectionsUpserted, sectionErrors },
    'Catalog sync complete',
  );
}

export async function syncCurrentTerm(termCode: string): Promise<void> {
  await syncTerm(termCode);
}
