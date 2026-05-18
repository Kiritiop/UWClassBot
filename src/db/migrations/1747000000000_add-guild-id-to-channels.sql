-- migrate up

ALTER TABLE discord_channels ADD COLUMN IF NOT EXISTS guild_id TEXT;
