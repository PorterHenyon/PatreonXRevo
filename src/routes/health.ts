import { Hono } from "hono";
import { env } from "../config.js";
import { getTargetSyncGuildIds, listSyncGuilds, getCreatorToken } from "../db/queries.js";
import { runStartupCheck } from "../startup-check.js";

const app = new Hono();

app.get("/health", (c) => {
  const report = runStartupCheck();
  const guilds = listSyncGuilds();
  return c.json({
    ok: report.ready,
    status: report.ready ? (report.warnings.length ? "degraded" : "healthy") : "not_ready",
    appBaseUrl: env.APP_BASE_URL,
    syncGuildCount: getTargetSyncGuildIds().length,
    syncGuilds: guilds.map((g) => ({ label: g.label, guildId: g.guild_id })),
    discordBot: env.ENABLE_DISCORD_BOT,
    webhookSecretConfigured: Boolean(env.PATREON_WEBHOOK_SECRET),
    creatorLinked: Boolean(getCreatorToken() || env.PATREON_CREATOR_ACCESS_TOKEN),
    warnings: report.warnings,
    errors: report.errors,
  });
});

export default app;
