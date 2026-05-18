import { pool } from '../pool';
import type { Enrollment } from '../../types';

export async function enrollUser(userId: string, sectionId: number): Promise<void> {
  await pool.query(
    `INSERT INTO enrollments (user_id, section_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, section_id) DO UPDATE SET active = TRUE`,
    [userId, sectionId],
  );
}

export async function unenrollUser(userId: string, sectionId: number): Promise<void> {
  await pool.query(
    'UPDATE enrollments SET active = FALSE WHERE user_id = $1 AND section_id = $2',
    [userId, sectionId],
  );
}

export async function getActiveEnrollments(userId: string): Promise<Enrollment[]> {
  const result = await pool.query<Enrollment>(
    'SELECT * FROM enrollments WHERE user_id = $1 AND active = TRUE',
    [userId],
  );
  return result.rows;
}

export async function countEnrollmentsForSection(sectionId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM enrollments WHERE section_id = $1 AND active = TRUE',
    [sectionId],
  );
  return parseInt(result.rows[0].count, 10);
}

export async function isEnrolled(userId: string, sectionId: number): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM enrollments WHERE user_id = $1 AND section_id = $2 AND active = TRUE) AS exists',
    [userId, sectionId],
  );
  return result.rows[0].exists;
}

export async function getEnrolledUserIds(sectionId: number): Promise<string[]> {
  const result = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM enrollments WHERE section_id = $1 AND active = TRUE',
    [sectionId],
  );
  return result.rows.map((r) => r.user_id);
}
