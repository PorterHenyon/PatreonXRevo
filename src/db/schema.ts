export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS patron_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patreon_user_id TEXT NOT NULL UNIQUE,
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  tier_id TEXT,
  entitled_tier_ids TEXT,
  pledge_status TEXT,
  patreon_full_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patron_links_discord ON patron_links(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_patron_links_guild ON patron_links(guild_id);

CREATE TABLE IF NOT EXISTS tier_role_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  tier_title TEXT,
  discord_role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, tier_id)
);

CREATE TABLE IF NOT EXISTS creator_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patreon_user_id TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patreon_user_id TEXT,
  discord_user_id TEXT,
  guild_id TEXT,
  event_type TEXT NOT NULL,
  tier_id TEXT,
  role_id TEXT,
  action TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at DESC);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_guilds (
  guild_id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'server',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
