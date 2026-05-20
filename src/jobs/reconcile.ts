import { config as loadEnv } from "dotenv";
loadEnv();

import { env } from "../config.js";
import { getDb, closeDb } from "../db/index.js";
import { listPatronLinks, getCreatorToken } from "../db/queries.js";
import { listCampaignMembers } from "../patreon/api.js";
import { syncPatronFromPatreon } from "../sync/apply-roles.js";
import { getTargetSyncGuildIds } from "../db/queries.js";

async function main(): Promise<void> {
  getDb();

  const token =
    getCreatorToken()?.access_token ?? env.PATREON_CREATOR_ACCESS_TOKEN;
  const campaignId =
    getCreatorToken()?.campaign_id ?? env.PATREON_CAMPAIGN_ID;

  if (!token || !campaignId) {
    console.error(
      "Set PATREON_CREATOR_ACCESS_TOKEN + PATREON_CAMPAIGN_ID or complete creator admin OAuth"
    );
    process.exit(1);
  }

  const guildIds = getTargetSyncGuildIds();
  if (guildIds.length === 0) {
    console.error("No sync guilds. Set PATREON_GUILD_ID, MAIN_GUILD_ID, or add in admin.");
    process.exit(1);
  }

  console.log(`Reconciling campaign ${campaignId} across ${guildIds.length} server(s)...`);

  const members = await listCampaignMembers(token, campaignId);
  const linked = new Map(listPatronLinks().map((p) => [p.patreon_user_id, p]));

  let synced = 0;
  let skipped = 0;

  for (const member of members) {
    if (!linked.has(member.patreonUserId)) {
      skipped++;
      continue;
    }

    const isActive = member.tierIds.length > 0;
    const result = await syncPatronFromPatreon(member.patreonUserId, "reconcile", {
      webhookHint: {
        tierIds: member.tierIds,
        patronStatus: member.patronStatus,
        isActive,
      },
    });

    if (result.success) synced++;
    else skipped++;

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`Done. Synced ${synced}, skipped ${skipped} (${members.length} Patreon members)`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
