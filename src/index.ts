import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./config.js";
import { getDb } from "./db/index.js";
import { getTargetSyncGuildIds, listSyncGuilds } from "./db/queries.js";
import authPatreon from "./routes/auth-patreon.js";
import authDiscord from "./routes/auth-discord.js";
import webhooksPatreon from "./routes/webhooks-patreon.js";
import admin from "./routes/admin.js";
import { startDiscordBot } from "./discord/bot.js";

getDb();

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.get("/", (c) => {
  const guilds = listSyncGuilds();
  const serverList =
    guilds.length > 0
      ? guilds.map((g) => `<li>${g.label}: …${g.guild_id.slice(-8)}</li>`).join("")
      : "<li>Creator: configure servers in <a href=\"/admin\">admin</a></li>";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PatreonXRevo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    .btn { display: inline-block; margin: 0.5rem 0.5rem 0.5rem 0; padding: 0.6rem 1rem; background: #5865f2; color: #fff; text-decoration: none; border-radius: 6px; }
    .btn.secondary { background: #374151; }
    .card { background: #f3f4f6; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>PatreonXRevo</h1>
  <p>Link your Patreon pledge to Discord roles on <strong>multiple servers</strong> (e.g. your Patreon server and main community).</p>
  <div class="card">
    <p><strong>Patrons:</strong></p>
    <a class="btn" href="/auth/patreon">1. Connect Patreon</a>
    <p class="btn secondary" style="opacity:0.7">Then Discord opens automatically</p>
    <p>Synced servers:</p>
    <ul>${serverList}</ul>
  </div>
  <p><a href="/admin">Creator admin</a> · <a href="/health">Health</a></p>
</body>
</html>`);
});

app.route("/", authPatreon);
app.route("/", authDiscord);
app.route("/", webhooksPatreon);
app.route("/", admin);

const port = env.PORT;
console.log(`PatreonXRevo listening on http://localhost:${port}`);
console.log(`Sync guilds: ${getTargetSyncGuildIds().join(", ") || "(none — set PATREON_GUILD_ID + MAIN_GUILD_ID)"}`);

if (env.ENABLE_DISCORD_BOT) {
  startDiscordBot().catch((err) => {
    console.error("Discord bot failed to start:", err);
    process.exit(1);
  });
} else {
  console.log("Discord gateway bot disabled (ENABLE_DISCORD_BOT=false)");
}

serve({ fetch: app.fetch, port });
