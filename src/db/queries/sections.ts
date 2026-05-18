import { pool } from '../pool';
import type { Section } from '../../types';

export async function upsertSection(
  courseId: number,
  sectionType: string,
  sectionNumber: string,
  instructor: string | null,
  days: string | null,
  startTime: string | null,
  endTime: string | null,
  location: string | null,
  classNumber: number | null,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sections (course_id, section_type, section_number, instructor, days, start_time, end_time, location, class_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (course_id, section_type, section_number) DO UPDATE SET
       instructor = EXCLUDED.instructor,
       days = EXCLUDED.days,
       start_time = EXCLUDED.start_time,
       end_time = EXCLUDED.end_time,
       location = EXCLUDED.location,
       class_number = EXCLUDED.class_number
     RETURNING id`,
    [courseId, sectionType, sectionNumber, instructor, days, startTime, endTime, location, classNumber],
  );
  return result.rows[0].id;
}

export async function getSectionsByCourse(courseId: number): Promise<Section[]> {
  const result = await pool.query<Section>(
    'SELECT * FROM sections WHERE course_id = $1 ORDER BY section_type, section_number',
    [courseId],
  );
  return result.rows;
}

export async function getSectionById(id: number): Promise<Section | null> {
  const result = await pool.query<Section>('SELECT * FROM sections WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getSectionByTypeAndNumber(
  courseId: number,
  sectionType: string,
  sectionNumber: string,
): Promise<Section | null> {
  const result = await pool.query<Section>(
    'SELECT * FROM sections WHERE course_id = $1 AND section_type = $2 AND section_number = $3',
    [courseId, sectionType, sectionNumber],
  );
  return result.rows[0] ?? null;
}
