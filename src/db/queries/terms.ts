import { pool } from '../pool';
import type { Term } from '../../types';

export async function getCurrentTerm(): Promise<Term | null> {
  const result = await pool.query<Term>('SELECT * FROM terms WHERE is_current = TRUE LIMIT 1');
  return result.rows[0] ?? null;
}

export async function upsertTerm(term: Omit<Term, 'is_current'>): Promise<void> {
  await pool.query(
    `INSERT INTO terms (term_code, name, start_date, end_date, exam_end_date, archive_date, delete_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (term_code) DO UPDATE SET
       name = EXCLUDED.name,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       exam_end_date = EXCLUDED.exam_end_date,
       archive_date = EXCLUDED.archive_date,
       delete_date = EXCLUDED.delete_date`,
    [term.term_code, term.name, term.start_date, term.end_date, term.exam_end_date, term.archive_date, term.delete_date],
  );
}

export async function setCurrentTerm(termCode: string): Promise<void> {
  await pool.query('UPDATE terms SET is_current = FALSE');
  await pool.query('UPDATE terms SET is_current = TRUE WHERE term_code = $1', [termCode]);
}

export async function getTermsDueForArchive(): Promise<Term[]> {
  const result = await pool.query<Term>(
    'SELECT * FROM terms WHERE archive_date <= CURRENT_DATE AND is_current = FALSE',
  );
  return result.rows;
}

export async function getTermsDueForDelete(): Promise<Term[]> {
  const result = await pool.query<Term>(
    'SELECT * FROM terms WHERE delete_date <= CURRENT_DATE',
  );
  return result.rows;
}
