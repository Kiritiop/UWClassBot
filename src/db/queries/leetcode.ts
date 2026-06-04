import { pool } from '../pool';

export async function markProblemPosted(guildId: string, questionId: string): Promise<void> {
  await pool.query(
    `INSERT INTO leetcode_posted_problems (guild_id, question_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id, question_id) DO NOTHING`,
    [guildId, questionId],
  );
}

export async function getPostedQuestionIds(guildId: string): Promise<Set<string>> {
  const res = await pool.query<{ question_id: string }>(
    'SELECT question_id FROM leetcode_posted_problems WHERE guild_id = $1',
    [guildId],
  );
  return new Set(res.rows.map((r) => r.question_id));
}
