-- migrate up

ALTER TABLE guild_configs ADD COLUMN IF NOT EXISTS leetcode_channel_id TEXT;
