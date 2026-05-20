import {
  getPatronByPatreonId,
  getAllManagedRoleIds,
  getRoleForTier,
  updatePatronEntitlement,
  insertSyncLog,
  upsertPatronLink,
  getTargetSyncGuildIds,
  getCreatorToken,
  getPatronEntitledTierIds,
} from "../db/queries.js";
import { addMemberRole, removeMemberRole, getMemberRoleIds } from "../discord/rest.js";
import { fetchMemberEntitlementForUser } from "../patreon/api.js";
import { env } from "../config.js";

export interface SyncInput {
  patreonUserId: string;
  tierIds: string[];
  isActive: boolean;
  patronStatus: string | null;
  eventType: string;
  guildId?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  rolesAdded: string[];
  rolesRemoved: string[];
  guildResults: Array<{ guildId: string; message: string; success: boolean }>;
  unlinked?: boolean;
}

export interface WebhookHint {
  tierIds: string[];
  patronStatus: string | null;
  isActive: boolean;
}

export interface SyncPatronOptions {
  guildId?: string;
  webhookHint?: WebhookHint;
  notifyUnlinked?: boolean;
}

async function syncRolesForPatronInGuild(
  input: SyncInput,
  guildId: string,
  discordUserId: string
): Promise<{ success: boolean; message: string; rolesAdded: string[]; rolesRemoved: string[] }> {
  const rolesAdded: string[] = [];
  const rolesRemoved: string[] = [];

  const managedRoleIds = getAllManagedRoleIds(guildId);
  if (managedRoleIds.length === 0) {
    const msg = `No tier→role mappings for guild ${guildId}`;
    insertSyncLog({
      patreonUserId: input.patreonUserId,
      discordUserId,
      guildId,
      eventType: input.eventType,
      action: "skip",
      success: false,
      message: msg,
    });
    return { success: false, message: msg, rolesAdded, rolesRemoved };
  }

  const entitledRoleIds = new Set<string>();
  if (input.isActive) {
    for (const tierId of input.tierIds) {
      const roleId = getRoleForTier(guildId, tierId);
      if (roleId) entitledRoleIds.add(roleId);
    }
  }

  let memberRoles: string[] | null;
  try {
    memberRoles = await getMemberRoleIds(guildId, discordUserId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch Discord member";
    insertSyncLog({
      patreonUserId: input.patreonUserId,
      discordUserId,
      guildId,
      eventType: input.eventType,
      action: "error",
      success: false,
      message: msg,
    });
    return { success: false, message: msg, rolesAdded, rolesRemoved };
  }

  if (memberRoles === null) {
    const msg = "User is not in this Discord server";
    insertSyncLog({
      patreonUserId: input.patreonUserId,
      discordUserId,
      guildId,
      eventType: input.eventType,
      action: "skip",
      success: false,
      message: msg,
    });
    return { success: false, message: msg, rolesAdded, rolesRemoved };
  }

  for (const roleId of managedRoleIds) {
    const hasRole = memberRoles.includes(roleId);
    const shouldHave = entitledRoleIds.has(roleId);

    if (shouldHave && !hasRole) {
      try {
        await addMemberRole(guildId, discordUserId, roleId);
        rolesAdded.push(roleId);
        insertSyncLog({
          patreonUserId: input.patreonUserId,
          discordUserId,
          guildId,
          eventType: input.eventType,
          roleId,
          action: "add_role",
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Add role failed";
        insertSyncLog({
          patreonUserId: input.patreonUserId,
          discordUserId,
          guildId,
          eventType: input.eventType,
          roleId,
          action: "add_role",
          success: false,
          message: msg,
        });
      }
    } else if (!shouldHave && hasRole) {
      try {
        await removeMemberRole(guildId, discordUserId, roleId);
        rolesRemoved.push(roleId);
        insertSyncLog({
          patreonUserId: input.patreonUserId,
          discordUserId,
          guildId,
          eventType: input.eventType,
          roleId,
          action: "remove_role",
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Remove role failed";
        insertSyncLog({
          patreonUserId: input.patreonUserId,
          discordUserId,
          guildId,
          eventType: input.eventType,
          roleId,
          action: "remove_role",
          success: false,
          message: msg,
        });
      }
    }
  }

  return {
    success: true,
    message: `+${rolesAdded.length} / -${rolesRemoved.length} roles`,
    rolesAdded,
    rolesRemoved,
  };
}

export async function syncRolesForPatron(input: SyncInput): Promise<SyncResult> {
  const patron = getPatronByPatreonId(input.patreonUserId);
  if (!patron) {
    const msg = "Patron has not linked Discord yet";
    return { success: false, message: msg, rolesAdded: [], rolesRemoved: [], guildResults: [], unlinked: true };
  }

  const guildIds = input.guildId ? [input.guildId] : getTargetSyncGuildIds();
  if (guildIds.length === 0) {
    const msg = "No sync servers configured. Add PATREON_GUILD_ID + MAIN_GUILD_ID in admin.";
    return { success: false, message: msg, rolesAdded: [], rolesRemoved: [], guildResults: [] };
  }

  const guildResults: SyncResult["guildResults"] = [];
  const rolesAdded: string[] = [];
  const rolesRemoved: string[] = [];
  let anySuccess = false;

  for (const guildId of guildIds) {
    const result = await syncRolesForPatronInGuild(
      input,
      guildId,
      patron.discord_user_id
    );
    guildResults.push({ guildId, message: result.message, success: result.success });
    rolesAdded.push(...result.rolesAdded);
    rolesRemoved.push(...result.rolesRemoved);
    if (result.success) anySuccess = true;
  }

  updatePatronEntitlement({
    patreonUserId: input.patreonUserId,
    tierIds: input.tierIds,
    pledgeStatus: input.patronStatus,
  });

  const message = guildResults
    .map((g) => `[${g.guildId.slice(-6)}] ${g.message}`)
    .join("; ");

  return {
    success: anySuccess,
    message,
    rolesAdded,
    rolesRemoved,
    guildResults,
  };
}

export function handleUnlinkedPatron(
  patreonUserId: string,
  eventType: string,
  hint?: WebhookHint
): void {
  const statusNote = hint?.isActive ? " (active pledge)" : "";
  insertSyncLog({
    patreonUserId,
    eventType,
    action: "unlinked_patron",
    success: false,
    message: `Patron must link at ${env.APP_BASE_URL}${statusNote}`,
  });
}

async function resolveEntitlement(
  patreonUserId: string,
  webhookHint?: WebhookHint
): Promise<{ tierIds: string[]; patronStatus: string | null; isActive: boolean }> {
  const creator = getCreatorToken();
  if (creator?.access_token && creator.campaign_id) {
    try {
      const fromApi = await fetchMemberEntitlementForUser(
        creator.access_token,
        creator.campaign_id,
        patreonUserId
      );
      if (fromApi) {
        return {
          tierIds: fromApi.tierIds,
          patronStatus: fromApi.patronStatus,
          isActive: fromApi.isActive,
        };
      }
    } catch (err) {
      console.warn("Patreon API entitlement fetch failed, using webhook hint:", err);
    }
  }

  if (webhookHint) {
    return {
      tierIds: webhookHint.tierIds,
      patronStatus: webhookHint.patronStatus,
      isActive: webhookHint.isActive,
    };
  }

  const patron = getPatronByPatreonId(patreonUserId);
  if (patron) {
    const tierIds = getPatronEntitledTierIds(patron);
    return {
      tierIds,
      patronStatus: patron.pledge_status,
      isActive: patron.pledge_status === "active_patron" && tierIds.length > 0,
    };
  }

  return { tierIds: [], patronStatus: null, isActive: false };
}

/** Primary sync entry: resolve entitlement from Patreon API, then add/remove roles on all sync guilds. */
export async function syncPatronFromPatreon(
  patreonUserId: string,
  eventType: string,
  options?: SyncPatronOptions
): Promise<SyncResult> {
  const patron = getPatronByPatreonId(patreonUserId);
  if (!patron) {
    if (options?.notifyUnlinked) {
      handleUnlinkedPatron(patreonUserId, eventType, options.webhookHint);
    } else {
      insertSyncLog({
        patreonUserId,
        eventType,
        action: "skip",
        success: false,
        message: "Patron has not linked Discord yet",
      });
    }
    return {
      success: false,
      message: "Patron has not linked Discord yet",
      rolesAdded: [],
      rolesRemoved: [],
      guildResults: [],
      unlinked: true,
    };
  }

  const { tierIds, patronStatus, isActive } = await resolveEntitlement(
    patreonUserId,
    options?.webhookHint
  );

  return syncRolesForPatron({
    patreonUserId,
    tierIds,
    isActive,
    patronStatus,
    eventType,
    guildId: options?.guildId,
  });
}

export async function syncAfterLink(data: {
  patreonUserId: string;
  discordUserId: string;
  patreonAccessToken: string;
  patreonFullName?: string | null;
}): Promise<SyncResult> {
  const { fetchIdentity } = await import("../patreon/api.js");
  const identity = await fetchIdentity(data.patreonAccessToken);

  const guildIds = getTargetSyncGuildIds();
  upsertPatronLink({
    patreonUserId: data.patreonUserId,
    discordUserId: data.discordUserId,
    guildId: guildIds[0] ?? "multi",
    patreonFullName: data.patreonFullName ?? identity.fullName,
  });

  return syncPatronFromPatreon(data.patreonUserId, "link:complete", {
    webhookHint: {
      tierIds: identity.activeTierIds,
      patronStatus: identity.pledgeStatuses[0] ?? null,
      isActive: identity.activeTierIds.length > 0,
    },
  });
}

export { getTargetSyncGuildIds, listSyncGuilds, upsertSyncGuild, removeSyncGuild } from "../db/queries.js";
