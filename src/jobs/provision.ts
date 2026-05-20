import { config as loadEnv } from "dotenv";
loadEnv();

import { env } from "../config.js";
import { getDb, closeDb } from "../db/index.js";
import { getCreatorToken } from "../db/queries.js";
import { provisionAndSyncPatrons } from "../sync/provision-roles.js";

async function main(): Promise<void> {
  getDb();

  const token =
    getCreatorToken()?.access_token ?? env.PATREON_CREATOR_ACCESS_TOKEN;
  const campaignId =
    getCreatorToken()?.campaign_id ?? env.PATREON_CAMPAIGN_ID;

  if (!token) {
    console.error(
      "No creator token. Complete creator OAuth in /admin or set PATREON_CREATOR_ACCESS_TOKEN."
    );
    process.exit(1);
  }

  console.log("Provisioning tier roles from Patreon...");
  const result = await provisionAndSyncPatrons(token, campaignId);

  for (const g of result.guilds) {
    console.log(
      `Guild ${g.guildId}: created ${g.created}, updated ${g.updated}, skipped ${g.skipped}, errors ${g.errors.length}`
    );
    for (const err of g.errors) console.error(`  - ${err}`);
  }

  console.log(
    `Patron bulk sync: ${result.patronSync.synced} ok, ${result.patronSync.failed} failed`
  );
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
