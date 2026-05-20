import type { PatreonTier } from "../patreon/api.js";
import { fetchCreatorCampaign } from "../patreon/api.js";
import {
  createGuildRole,
  updateGuildRole,
  getGuildRole,
  getGuildRoles,
  findGuildRoleByName,
} from "../discord/rest.js";
import {
  getRoleForTier,
  upsertTierRoleMap,
  insertSyncLog,
  getTargetSyncGuildIds,
  listPatronLinks,
} from "../db/queries.js";
import { syncPatronFromPatreon } from "./apply-roles.js";

export function formatTierRoleName(title: string, amountCents: number | null): string {
  let price: string;
  if (amountCents == null || amountCents === 0) {
    price = "Free";
  } else if (amountCents % 100 === 0) {
    price = `$${amountCents / 100}`;
  } else {
    price = `$${(amountCents / 100).toFixed(2)}`;
  }
  const raw = `${title} (${price})`;
  return raw
    .replace(/@/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 100);
}

function tierColorFromId(tierId: string): number {
  let hash = 0;
  for (let i = 0; i < tierId.length; i++) {
    hash = tierId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash & 0xffffff;
}

export interface GuildProvisionResult {
  guildId: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ProvisionResult {
  campaignId: string;
  tiers: number;
  guilds: GuildProvisionResult[];
}

async function provisionTierInGuild(
  tier: PatreonTier,
  guildId: string,
  campaignId: string
): Promise<"created" | "updated" | "skipped"> {
  const roleName = formatTierRoleName(tier.title, tier.amountCents);
  const color = tierColorFromId(tier.id);

  let roleId = getRoleForTier(guildId, tier.id);
  let role = roleId ? await getGuildRole(guildId, roleId) : null;

  if (!role) {
    const guildRoles = await getGuildRoles(guildId);
    const byName = findGuildRoleByName(guildRoles, roleName);
    if (byName) {
      role = byName;
      roleId = byName.id;
    }
  }

  if (role) {
    if (role.name !== roleName) {
      await updateGuildRole(guildId, role.id, { name: roleName, color });
      upsertTierRoleMap({
        guildId,
        campaignId,
        tierId: tier.id,
        tierTitle: tier.title,
        discordRoleId: role.id,
      });
      insertSyncLog({
        guildId,
        eventType: "provision",
        tierId: tier.id,
        roleId: role.id,
        action: "provision_role",
        success: true,
        message: `Updated role name to ${roleName}`,
      });
      return "updated";
    }
    upsertTierRoleMap({
      guildId,
      campaignId,
      tierId: tier.id,
      tierTitle: tier.title,
      discordRoleId: role.id,
    });
    return "skipped";
  }

  const created = await createGuildRole(guildId, {
    name: roleName,
    color,
    reason: `Patreon tier: ${tier.title}`,
  });
  upsertTierRoleMap({
    guildId,
    campaignId,
    tierId: tier.id,
    tierTitle: tier.title,
    discordRoleId: created.id,
  });
  insertSyncLog({
    guildId,
    eventType: "provision",
    tierId: tier.id,
    roleId: created.id,
    action: "provision_role",
    success: true,
    message: `Created role ${roleName}`,
  });
  return "created";
}

export async function provisionTierRoles(
  accessToken: string,
  campaignId?: string
): Promise<ProvisionResult> {
  const campaign = await fetchCreatorCampaign(accessToken);
  const cid = campaignId ?? campaign.campaignId;
  const guildIds = getTargetSyncGuildIds();

  if (guildIds.length === 0) {
    throw new Error(
      "No sync servers configured. Set PATREON_GUILD_ID and MAIN_GUILD_ID in .env or add servers in admin."
    );
  }

  const guildResults: GuildProvisionResult[] = [];

  for (const guildId of guildIds) {
    const result: GuildProvisionResult = {
      guildId,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const tier of campaign.tiers) {
      try {
        const outcome = await provisionTierInGuild(tier, guildId, cid);
        if (outcome === "created") result.created++;
        else if (outcome === "updated") result.updated++;
        else result.skipped++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${tier.title}: ${msg}`);
        insertSyncLog({
          guildId,
          eventType: "provision",
          tierId: tier.id,
          action: "provision_role",
          success: false,
          message: msg,
        });
      }
    }

    guildResults.push(result);
  }

  return {
    campaignId: cid,
    tiers: campaign.tiers.length,
    guilds: guildResults,
  };
}

export async function syncAllLinkedPatrons(): Promise<{
  synced: number;
  failed: number;
}> {
  const patrons = listPatronLinks();
  let synced = 0;
  let failed = 0;

  for (const patron of patrons) {
    try {
      const result = await syncPatronFromPatreon(
        patron.patreon_user_id,
        "provision:bulk_sync"
      );
      if (result.success) synced++;
      else failed++;
    } catch {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return { synced, failed };
}

export async function provisionAndSyncPatrons(
  accessToken: string,
  campaignId?: string
): Promise<ProvisionResult & { patronSync: { synced: number; failed: number } }> {
  const provision = await provisionTierRoles(accessToken, campaignId);
  const patronSync = await syncAllLinkedPatrons();
  return { ...provision, patronSync };
}
