import { pool } from '../pool';
import type { Course } from '../../types';

export async function upsertCourse(
  subject: string,
  catalogNumber: string,
  title: string,
  description: string | null,
  termCode: string,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO courses (subject, catalog_number, title, description, term_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subject, catalog_number, term_code) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description
     RETURNING id`,
    [subject, catalogNumber, title, description, termCode],
  );
  return result.rows[0].id;
}

export async function getCourseByCode(
  subject: string,
  catalogNumber: string,
  termCode: string,
): Promise<Course | null> {
  const result = await pool.query<Course>(
    'SELECT * FROM courses WHERE subject = $1 AND catalog_number = $2 AND term_code = $3',
    [subject, catalogNumber, termCode],
  );
  return result.rows[0] ?? null;
}

export async function getCourseById(id: number): Promise<Course | null> {
  const result = await pool.query<Course>('SELECT * FROM courses WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getCoursesByTerm(termCode: string): Promise<Course[]> {
  const result = await pool.query<Course>(
    'SELECT * FROM courses WHERE term_code = $1 ORDER BY subject, catalog_number',
    [termCode],
  );
  return result.rows;
}
