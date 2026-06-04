-- migrate up

CREATE TABLE IF NOT EXISTS leetcode_posted_problems (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_leetcode_posted_guild ON leetcode_posted_problems(guild_id);
