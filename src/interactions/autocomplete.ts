import type { AutocompleteInteraction } from 'discord.js';
import { pool } from '../db/pool';
import { getCurrentTerm } from '../db/queries/terms';
import { parseCourseCode } from '../services/enrollmentService';

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const term = await getCurrentTerm();
  if (!term) { await interaction.respond([]); return; }

  const cmd = interaction.commandName;
  const filterByEnrollment = cmd === 'unenroll' || cmd === 'anonymous';

  if (focused.name === 'course_code') {
    const input = focused.value.trim().toUpperCase();
    const result = filterByEnrollment
      ? await pool.query<{ subject: string; catalog_number: string }>(
          `SELECT DISTINCT c.subject, c.catalog_number
           FROM courses c
           JOIN sections s ON s.course_id = c.id
           JOIN enrollments e ON e.section_id = s.id
           WHERE c.term_code = $1
           AND e.user_id = $2
           AND e.active = TRUE
           AND (c.subject || ' ' || c.catalog_number) LIKE $3
           ORDER BY c.subject, c.catalog_number
           LIMIT 25`,
          [term.term_code, interaction.user.id, `${input}%`],
        )
      : await pool.query<{ subject: string; catalog_number: string }>(
          `SELECT DISTINCT subject, catalog_number FROM courses
           WHERE term_code = $1
           AND (subject || ' ' || catalog_number) LIKE $2
           ORDER BY subject, catalog_number
           LIMIT 25`,
          [term.term_code, `${input}%`],
        );
    await interaction.respond(
      result.rows.map((r) => ({
        name: `${r.subject} ${r.catalog_number}`,
        value: `${r.subject} ${r.catalog_number}`,
      })),
    );
    return;
  }

  if (focused.name === 'section') {
    const courseCodeRaw = interaction.options.getString('course_code') ?? '';
    const parsed = parseCourseCode(courseCodeRaw);
    if (!parsed) { await interaction.respond([]); return; }

    const input = focused.value.trim().toUpperCase();
    const result = filterByEnrollment
      ? await pool.query<{ section_type: string; section_number: string }>(
          `SELECT s.section_type, s.section_number
           FROM sections s
           JOIN courses c ON c.id = s.course_id
           JOIN enrollments e ON e.section_id = s.id
           WHERE c.subject = $1 AND c.catalog_number = $2 AND c.term_code = $3
           AND e.user_id = $4
           AND e.active = TRUE
           AND (s.section_type || ' ' || s.section_number) LIKE $5
           ORDER BY s.section_type, s.section_number
           LIMIT 25`,
          [parsed.subject, parsed.catalogNumber, term.term_code, interaction.user.id, input ? `${input}%` : '%'],
        )
      : await pool.query<{ section_type: string; section_number: string }>(
          `SELECT s.section_type, s.section_number
           FROM sections s
           JOIN courses c ON c.id = s.course_id
           WHERE c.subject = $1 AND c.catalog_number = $2 AND c.term_code = $3
           AND (s.section_type || ' ' || s.section_number) LIKE $4
           ORDER BY s.section_type, s.section_number
           LIMIT 25`,
          [parsed.subject, parsed.catalogNumber, term.term_code, input ? `${input}%` : '%'],
        );
    await interaction.respond(
      result.rows.map((r) => ({
        name: `${r.section_type} ${r.section_number}`,
        value: `${r.section_type} ${r.section_number}`,
      })),
    );
    return;
  }

  await interaction.respond([]);
}
