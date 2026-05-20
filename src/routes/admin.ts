import { Hono } from "hono";
import { getSession } from "../session.js";
import {
  getTierRoleMaps,
  getRecentRoleSyncLogs,
  getAppConfig,
  listSyncGuilds,
  upsertSyncGuild,
  removeSyncGuild,
} from "../db/queries.js";
import { getBotGuilds, getGuildRole } from "../discord/rest.js";
import { fetchCreatorCampaign } from "../patreon/api.js";
import { formatTierRoleName, provisionAndSyncPatrons } from "../sync/provision-roles.js";
import { env } from "../config.js";

const app = new Hono();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/admin/login", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Creator login</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:3rem auto;padding:0 1rem}</style>
</head>
<body>
  <h1>Creator admin</h1>
  <p>Log in with the Patreon account that owns the campaign.</p>
  <p><a href="/auth/patreon?creator=1">Log in with Patreon</a></p>
  <p><a href="/">← Home</a></p>
</body>
</html>`);
});

app.get("/admin", async (c) => {
  const session = getSession(c);
  if (!session.isCreator || !session.patreonAccessToken) {
    return c.redirect("/admin/login");
  }

  const activeGuild = c.req.query("guild") ?? listSyncGuilds()[0]?.guild_id ?? "";
  const provisionMsg = c.req.query("provisioned");
  const campaignId =
    session.campaignId ?? getAppConfig("campaign_id") ?? env.PATREON_CAMPAIGN_ID ?? "";

  let tiers: Array<{ id: string; title: string; amountCents: number | null }> = [];
  let guilds: Array<{ id: string; name: string }> = [];
  const syncGuilds = listSyncGuilds();
  let mappings: Array<{
    tier_id: string;
    tier_title: string | null;
    discord_role_id: string;
  }> = [];

  try {
    guilds = await getBotGuilds();
  } catch (err) {
    console.warn(err);
  }

  if (session.patreonAccessToken) {
    try {
      const campaign = await fetchCreatorCampaign(session.patreonAccessToken);
      tiers = campaign.tiers;
    } catch (err) {
      console.warn(err);
    }
  }

  if (activeGuild) {
    mappings = getTierRoleMaps(activeGuild);
  }

  const roleNameById = new Map<string, string>();
  for (const m of mappings) {
    try {
      const role = await getGuildRole(activeGuild, m.discord_role_id);
      if (role) roleNameById.set(m.discord_role_id, role.name);
    } catch {
      roleNameById.set(m.discord_role_id, "(unknown)");
    }
  }

  const roleLogs = getRecentRoleSyncLogs(10);
  const webhookUrl = `${env.APP_BASE_URL}/webhooks/patreon`;

  const botGuildOptions = guilds
    .map((g) => `<option value="${g.id}">${escapeHtml(g.name)} (${g.id})</option>`)
    .join("");

  const syncGuildList = syncGuilds
    .map(
      (g) =>
        `<li>
          <strong>${escapeHtml(g.label)}</strong> — <code>${g.guild_id}</code>
          <a href="/admin?guild=${g.guild_id}">View roles</a>
          <form method="post" action="/admin/guild/remove" style="display:inline">
            <input type="hidden" name="guildId" value="${g.guild_id}">
            <button type="submit">Remove</button>
          </form>
        </li>`
    )
    .join("");

  const guildTabLinks = syncGuilds
    .map(
      (g) =>
        `<a href="/admin?guild=${g.guild_id}" style="margin-right:1rem;${g.guild_id === activeGuild ? "font-weight:bold" : ""}">${escapeHtml(g.label)}</a>`
    )
    .join("");

  const mappingRows = tiers
    .map((tier) => {
      const existing = mappings.find((m) => m.tier_id === tier.id);
      const expectedName = formatTierRoleName(tier.title, tier.amountCents);
      const actualName = existing
        ? roleNameById.get(existing.discord_role_id) ?? expectedName
        : "— not provisioned —";
      return `<tr>
        <td>${escapeHtml(tier.title)}<br><small>${tier.id}</small></td>
        <td>${escapeHtml(expectedName)}</td>
        <td>${escapeHtml(actualName)}<br><small>${existing?.discord_role_id ?? ""}</small></td>
      </tr>`;
    })
    .join("");

  const logRows = roleLogs
    .map(
      (l) => `<tr>
        <td>${l.created_at}</td>
        <td><small>${escapeHtml(l.guild_id ?? "")}</small></td>
        <td>${escapeHtml(l.event_type)}</td>
        <td>${escapeHtml(l.action)}</td>
        <td>${l.success ? "ok" : "fail"}</td>
        <td>${escapeHtml(l.message ?? "")}</td>
      </tr>`
    )
    .join("");

  const flash =
    provisionMsg === "1"
      ? '<p class="flash ok">Roles synced from Patreon on all servers.</p>'
      : provisionMsg === "err"
        ? '<p class="flash err">Provisioning failed — check server logs.</p>'
        : "";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Admin — PatreonXRevo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    .card { background: #f9fafb; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 4px; }
    form.inline { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .flash.ok { color: #16a34a; } .flash.err { color: #dc2626; }
    .btn { padding: 0.5rem 1rem; background: #5865f2; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Creator admin</h1>
  <p>Campaign: <code>${escapeHtml(campaignId)}</code></p>
  ${flash}

  <div class="card">
    <h2>Auto-provision roles</h2>
    <p>Creates Discord roles named like <code>Tier Title ($5)</code> on every sync server and maps them to Patreon tiers.</p>
    <form method="post" action="/admin/provision">
      <button type="submit" class="btn">Sync roles from Patreon</button>
    </form>
  </div>

  <div class="card">
    <h2>Multi-server sync</h2>
    <ul>${syncGuildList || "<li>No servers — set PATREON_GUILD_ID and MAIN_GUILD_ID in .env</li>"}</ul>
    <form method="post" action="/admin/guild/add" class="inline">
      <select name="guildId" required>
        <option value="">— Pick server bot is in —</option>
        ${botGuildOptions}
      </select>
      <input name="label" placeholder="Label (patreon or main)" required>
      <button type="submit">Add server</button>
    </form>
  </div>

  <div class="card">
    <h2>Patron linking</h2>
    <p>Patrons must link once at <a href="${escapeHtml(env.APP_BASE_URL)}">${escapeHtml(env.APP_BASE_URL)}</a> (or <code>/link</code>). Unlinked supporters log as <code>unlinked_patron</code>. Cancelled pledges remove roles on both servers when linked.</p>
  </div>

  <div class="card">
    <h2>Webhook</h2>
    <p>URL: <code>${escapeHtml(webhookUrl)}</code></p>
  </div>

  <h2>Tier → role mappings</h2>
  <p>${guildTabLinks || "Add servers first."}</p>
  <p>Bot role must sit <strong>above</strong> these roles in Discord.</p>
  <table>
    <thead><tr><th>Patreon tier</th><th>Expected role name</th><th>Discord role (${escapeHtml(activeGuild ? "…" + activeGuild.slice(-8) : "pick server")})</th></tr></thead>
    <tbody>${mappingRows || "<tr><td colspan=3>Click Sync roles from Patreon</td></tr>"}</tbody>
  </table>

  <h2>Recent role sync log</h2>
  <table>
    <thead><tr><th>Time</th><th>Guild</th><th>Event</th><th>Action</th><th>OK</th><th>Message</th></tr></thead>
    <tbody>${logRows || "<tr><td colspan=6>No logs yet</td></tr>"}</tbody>
  </table>

  <p><a href="/">← Home</a></p>
</body>
</html>`);
});

app.post("/admin/provision", async (c) => {
  const session = getSession(c);
  if (!session.isCreator || !session.patreonAccessToken) {
    return c.redirect("/admin/login");
  }

  try {
    await provisionAndSyncPatrons(
      session.patreonAccessToken,
      session.campaignId ?? getAppConfig("campaign_id")
    );
    return c.redirect("/admin?provisioned=1");
  } catch (err) {
    console.error("Provision failed:", err);
    return c.redirect("/admin?provisioned=err");
  }
});

app.post("/admin/guild/add", async (c) => {
  const session = getSession(c);
  if (!session.isCreator) return c.redirect("/admin/login");

  const body = await c.req.parseBody();
  const guildId = String(body.guildId ?? "");
  const label = String(body.label ?? "server").trim();
  if (guildId) upsertSyncGuild(guildId, label);
  return c.redirect(`/admin?guild=${guildId}`);
});

app.post("/admin/guild/remove", async (c) => {
  const session = getSession(c);
  if (!session.isCreator) return c.redirect("/admin/login");

  const body = await c.req.parseBody();
  const guildId = String(body.guildId ?? "");
  if (guildId) removeSyncGuild(guildId);
  return c.redirect("/admin");
});

export default app;
