import { env, parseSyncGuildIdsFromEnv } from "./config.js";
import { getTargetSyncGuildIds } from "./db/queries.js";
import { getCreatorToken } from "./db/queries.js";

export interface StartupReport {
  ready: boolean;
  warnings: string[];
  errors: string[];
}

export function runStartupCheck(): StartupReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (env.SESSION_SECRET.includes("change-me")) {
    warnings.push("SESSION_SECRET is still the example value — use a long random string in production.");
  }

  if (!env.PATREON_WEBHOOK_SECRET) {
    warnings.push("PATREON_WEBHOOK_SECRET is not set — webhooks will not verify signatures.");
  }

  const guildIds = getTargetSyncGuildIds();
  if (guildIds.length === 0) {
    errors.push(
      "No sync servers configured. Set PATREON_GUILD_ID and MAIN_GUILD_ID in .env (or add servers in /admin)."
    );
  } else if (guildIds.length < 2) {
    warnings.push(
      `Only ${guildIds.length} sync server configured — set both PATREON_GUILD_ID and MAIN_GUILD_ID for dual-server sync.`
    );
  }

  if (env.APP_BASE_URL.startsWith("http://") && !env.APP_BASE_URL.includes("localhost")) {
    warnings.push(
      "APP_BASE_URL uses HTTP — Patreon webhooks require HTTPS in production."
    );
  }

  if (!getCreatorToken() && !env.PATREON_CREATOR_ACCESS_TOKEN) {
    warnings.push(
      "No creator Patreon token yet — complete /admin login once so API sync and webhooks work reliably."
    );
  }

  const base = new URL(env.APP_BASE_URL).origin;
  for (const uri of [env.PATREON_REDIRECT_URI, env.DISCORD_REDIRECT_URI]) {
    if (!uri.startsWith(base)) {
      warnings.push(
        `Redirect URI ${uri} does not match APP_BASE_URL origin ${base} — OAuth may fail.`
      );
    }
  }

  const seeded = parseSyncGuildIdsFromEnv();
  if (seeded.length > 0 && guildIds.length === 0) {
    warnings.push("Guild IDs in .env but sync_guilds table empty — restart after first db init.");
  }

  const ready = errors.length === 0;

  return { ready, warnings, errors };
}

export function printStartupCheck(report: StartupReport): void {
  console.log("--- PatreonXRevo startup check ---");
  if (report.errors.length) {
    for (const e of report.errors) console.error(`[ERROR] ${e}`);
  }
  if (report.warnings.length) {
    for (const w of report.warnings) console.warn(`[WARN] ${w}`);
  }
  if (report.ready && report.warnings.length === 0) {
    console.log("[OK] Configuration looks ready for go-live.");
  } else if (report.ready) {
    console.log("[OK] Can start, but review warnings above before go-live.");
  } else {
    console.error("[FAIL] Fix errors above before go-live.");
  }
  console.log("----------------------------------");
}
