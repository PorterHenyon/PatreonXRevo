import { getDb } from "./index.js";
import { parseEntitledTierIdsJson } from "../patreon/entitlement.js";

export interface PatronLink {
  id: number;
  patreon_user_id: string;
  discord_user_id: string;
  guild_id: string;
  tier_id: string | null;
  entitled_tier_ids: string | null;
  pledge_status: string | null;
  patreon_full_name: string | null;
}

export function getPatronEntitledTierIds(patron: PatronLink): string[] {
  const fromJson = parseEntitledTierIdsJson(patron.entitled_tier_ids);
  if (fromJson.length > 0) return fromJson;
  if (patron.tier_id) return [patron.tier_id];
  return [];
}

export interface TierRoleMap {
  id: number;
  guild_id: string;
  campaign_id: string;
  tier_id: string;
  tier_title: string | null;
  discord_role_id: string;
}

export function upsertPatronLink(data: {
  patreonUserId: string;
  discordUserId: string;
  guildId: string;
  tierId?: string | null;
  pledgeStatus?: string | null;
  patreonFullName?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO patron_links (patreon_user_id, discord_user_id, guild_id, tier_id, pledge_status, patreon_full_name)
     VALUES (@patreonUserId, @discordUserId, @guildId, @tierId, @pledgeStatus, @patreonFullName)
     ON CONFLICT(patreon_user_id) DO UPDATE SET
       discord_user_id = excluded.discord_user_id,
       guild_id = excluded.guild_id,
       tier_id = COALESCE(excluded.tier_id, patron_links.tier_id),
       pledge_status = COALESCE(excluded.pledge_status, patron_links.pledge_status),
       patreon_full_name = COALESCE(excluded.patreon_full_name, patron_links.patreon_full_name),
       updated_at = datetime('now')`
  ).run({
    patreonUserId: data.patreonUserId,
    discordUserId: data.discordUserId,
    guildId: data.guildId,
    tierId: data.tierId ?? null,
    pledgeStatus: data.pledgeStatus ?? null,
    patreonFullName: data.patreonFullName ?? null,
  });
}

export function getPatronByPatreonId(patreonUserId: string): PatronLink | undefined {
  return getDb()
    .prepare("SELECT * FROM patron_links WHERE patreon_user_id = ?")
    .get(patreonUserId) as PatronLink | undefined;
}

export function getPatronByDiscordId(discordUserId: string): PatronLink | undefined {
  return getDb()
    .prepare("SELECT * FROM patron_links WHERE discord_user_id = ?")
    .get(discordUserId) as PatronLink | undefined;
}

export function updatePatronPledge(
  patreonUserId: string,
  tierId: string | null,
  pledgeStatus: string | null
): void {
  updatePatronEntitlement({
    patreonUserId,
    tierIds: tierId ? [tierId] : [],
    pledgeStatus,
  });
}

export function updatePatronEntitlement(data: {
  patreonUserId: string;
  tierIds: string[];
  pledgeStatus: string | null;
}): void {
  const tierId = data.tierIds[0] ?? null;
  const entitledJson = JSON.stringify(data.tierIds);
  getDb()
    .prepare(
      `UPDATE patron_links SET
         tier_id = ?,
         entitled_tier_ids = ?,
         pledge_status = ?,
         updated_at = datetime('now')
       WHERE patreon_user_id = ?`
    )
    .run(tierId, entitledJson, data.pledgeStatus, data.patreonUserId);
}

export function listPatronLinks(guildId?: string): PatronLink[] {
  if (guildId) {
    return getDb()
      .prepare("SELECT * FROM patron_links WHERE guild_id = ?")
      .all(guildId) as PatronLink[];
  }
  return getDb().prepare("SELECT * FROM patron_links").all() as PatronLink[];
}

export function getTierRoleMaps(guildId: string): TierRoleMap[] {
  return getDb()
    .prepare("SELECT * FROM tier_role_map WHERE guild_id = ?")
    .all(guildId) as TierRoleMap[];
}

export function getAllManagedRoleIds(guildId: string): string[] {
  const rows = getDb()
    .prepare("SELECT discord_role_id FROM tier_role_map WHERE guild_id = ?")
    .all(guildId) as { discord_role_id: string }[];
  return rows.map((r) => r.discord_role_id);
}

export function getRoleForTier(guildId: string, tierId: string): string | undefined {
  const row = getDb()
    .prepare(
      "SELECT discord_role_id FROM tier_role_map WHERE guild_id = ? AND tier_id = ?"
    )
    .get(guildId, tierId) as { discord_role_id: string } | undefined;
  return row?.discord_role_id;
}

export function upsertTierRoleMap(data: {
  guildId: string;
  campaignId: string;
  tierId: string;
  tierTitle?: string;
  discordRoleId: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO tier_role_map (guild_id, campaign_id, tier_id, tier_title, discord_role_id)
       VALUES (@guildId, @campaignId, @tierId, @tierTitle, @discordRoleId)
       ON CONFLICT(guild_id, tier_id) DO UPDATE SET
         discord_role_id = excluded.discord_role_id,
         tier_title = COALESCE(excluded.tier_title, tier_role_map.tier_title),
         campaign_id = excluded.campaign_id`
    )
    .run({
      guildId: data.guildId,
      campaignId: data.campaignId,
      tierId: data.tierId,
      tierTitle: data.tierTitle ?? null,
      discordRoleId: data.discordRoleId,
    });
}

export function deleteTierRoleMap(guildId: string, tierId: string): void {
  getDb()
    .prepare("DELETE FROM tier_role_map WHERE guild_id = ? AND tier_id = ?")
    .run(guildId, tierId);
}

export function insertSyncLog(data: {
  patreonUserId?: string;
  discordUserId?: string;
  guildId?: string;
  eventType: string;
  tierId?: string;
  roleId?: string;
  action: string;
  success: boolean;
  message?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO sync_log (patreon_user_id, discord_user_id, guild_id, event_type, tier_id, role_id, action, success, message)
       VALUES (@patreonUserId, @discordUserId, @guildId, @eventType, @tierId, @roleId, @action, @success, @message)`
    )
    .run({
      patreonUserId: data.patreonUserId ?? null,
      discordUserId: data.discordUserId ?? null,
      guildId: data.guildId ?? null,
      eventType: data.eventType,
      tierId: data.tierId ?? null,
      roleId: data.roleId ?? null,
      action: data.action,
      success: data.success ? 1 : 0,
      message: data.message ?? null,
    });
}

export function getRecentRoleSyncLogs(limit = 10): Array<{
  id: number;
  patreon_user_id: string | null;
  discord_user_id: string | null;
  guild_id: string | null;
  event_type: string;
  tier_id: string | null;
  role_id: string | null;
  action: string;
  success: number;
  message: string | null;
  created_at: string;
}> {
  return getDb()
    .prepare(
      `SELECT * FROM sync_log
       WHERE action IN ('add_role', 'remove_role', 'unlinked_patron', 'skip')
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as ReturnType<typeof getRecentRoleSyncLogs>;
}

export function getRecentSyncLogs(limit = 50): Array<{
  id: number;
  patreon_user_id: string | null;
  discord_user_id: string | null;
  guild_id: string | null;
  event_type: string;
  tier_id: string | null;
  role_id: string | null;
  action: string;
  success: number;
  message: string | null;
  created_at: string;
}> {
  return getDb()
    .prepare("SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ReturnType<typeof getRecentSyncLogs>;
}

export function getAppConfig(key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM app_config WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setAppConfig(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

export function saveCreatorToken(data: {
  patreonUserId: string;
  campaignId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO creator_tokens (patreon_user_id, campaign_id, access_token, refresh_token, expires_at)
       VALUES (@patreonUserId, @campaignId, @accessToken, @refreshToken, @expiresAt)
       ON CONFLICT(patreon_user_id) DO UPDATE SET
         campaign_id = excluded.campaign_id,
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, creator_tokens.refresh_token),
         expires_at = excluded.expires_at,
         updated_at = datetime('now')`
    )
    .run({
      patreonUserId: data.patreonUserId,
      campaignId: data.campaignId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null,
    });
}

export function getCreatorToken(): { access_token: string; campaign_id: string } | undefined {
  const row = getDb()
    .prepare("SELECT access_token, campaign_id FROM creator_tokens LIMIT 1")
    .get() as { access_token: string; campaign_id: string } | undefined;
  if (row) return row;
  return undefined;
}

export interface SyncGuild {
  guild_id: string;
  label: string;
  enabled: number;
}

export function listSyncGuilds(): SyncGuild[] {
  return getDb()
    .prepare("SELECT * FROM sync_guilds WHERE enabled = 1 ORDER BY label")
    .all() as SyncGuild[];
}

export function upsertSyncGuild(guildId: string, label: string): void {
  getDb()
    .prepare(
      `INSERT INTO sync_guilds (guild_id, label, enabled)
       VALUES (?, ?, 1)
       ON CONFLICT(guild_id) DO UPDATE SET label = excluded.label, enabled = 1`
    )
    .run(guildId, label);
}

export function removeSyncGuild(guildId: string): void {
  getDb().prepare("DELETE FROM sync_guilds WHERE guild_id = ?").run(guildId);
}

export function getDistinctMappingGuildIds(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT guild_id FROM tier_role_map")
    .all() as { guild_id: string }[];
  return rows.map((r) => r.guild_id);
}

/** Guilds that should receive role sync: enabled sync_guilds + any guild with mappings */
export function getTargetSyncGuildIds(): string[] {
  const ids = new Set<string>();
  for (const g of listSyncGuilds()) {
    ids.add(g.guild_id);
  }
  for (const g of getDistinctMappingGuildIds()) {
    ids.add(g);
  }
  return [...ids];
}
