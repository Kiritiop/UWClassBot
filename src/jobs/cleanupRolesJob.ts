import { pool } from '../db/pool';
import { client } from '../client';
import { courseRoleName, sectionRoleName } from '../utils/embeds';
import { logger } from '../utils/logger';

export async function runCleanupRolesJob(): Promise<void> {
  // Section roles with zero active enrollments
  const emptySecRes = await pool.query<{
    subject: string; catalog_number: string; section_type: string; section_number: string;
  }>(`
    SELECT c.subject, c.catalog_number, s.section_type, s.section_number
    FROM sections s
    JOIN courses c ON c.id = s.course_id
    WHERE NOT EXISTS (
      SELECT 1 FROM enrollments e WHERE e.section_id = s.id AND e.active = TRUE
    )
  `);

  // Course roles with zero active enrollments across all their sections
  const emptyCourseRes = await pool.query<{ subject: string; catalog_number: string }>(`
    SELECT DISTINCT c.subject, c.catalog_number FROM courses c
    WHERE NOT EXISTS (
      SELECT 1 FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      WHERE s.course_id = c.id AND e.active = TRUE
    )
  `);

  let deleted = 0;

  for (const guild of client.guilds.cache.values()) {
    for (const row of emptySecRes.rows) {
      const name = sectionRoleName(row.subject, row.catalog_number, row.section_type, row.section_number);
      const role = guild.roles.cache.find((r) => r.name === name);
      if (role) {
        await role.delete('No enrolled members').catch(() => null);
        deleted++;
      }
    }

    for (const row of emptyCourseRes.rows) {
      const name = courseRoleName(row.subject, row.catalog_number);
      const role = guild.roles.cache.find((r) => r.name === name);
      if (role) {
        await role.delete('No enrolled members').catch(() => null);
        deleted++;
      }
    }
  }

  if (deleted > 0) logger.info({ deleted }, 'Cleanup: deleted empty roles');
}
