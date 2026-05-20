import { Hono } from "hono";
import {
  discordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
  addUserToGuild,
} from "../discord/oauth.js";
import { getSession, setSession, newOAuthState } from "../session.js";
import { syncAfterLink } from "../sync/apply-roles.js";
import { upsertPatronLink } from "../db/queries.js";
import { getTargetSyncGuildIds } from "../db/queries.js";

const app = new Hono();

app.get("/auth/discord", (c) => {
  const session = getSession(c);
  if (!session.patreonUserId) {
    return c.redirect("/auth/patreon");
  }
  const state = newOAuthState();
  setSession(c, { ...session, oauthState: state });
  return c.redirect(discordAuthorizeUrl(state));
});

app.get("/auth/discord/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const session = getSession(c);

  if (!code || !state || state !== session.oauthState) {
    return c.text("Invalid OAuth state", 400);
  }

  if (!session.patreonUserId || !session.patreonAccessToken) {
    return c.redirect("/auth/patreon");
  }

  const guildIds = getTargetSyncGuildIds();
  if (guildIds.length === 0) {
    return c.text(
      "No Discord servers configured. Creator must add PATREON_GUILD_ID and MAIN_GUILD_ID (or use admin).",
      503
    );
  }

  try {
    const tokens = await exchangeDiscordCode(code);
    const user = await fetchDiscordUser(tokens.access_token);

    for (const guildId of guildIds) {
      try {
        await addUserToGuild(user.id, tokens.access_token, guildId);
      } catch (err) {
        console.warn(`Could not add user to guild ${guildId}:`, err);
      }
    }

    upsertPatronLink({
      patreonUserId: session.patreonUserId,
      discordUserId: user.id,
      guildId: guildIds[0] ?? "multi",
      patreonFullName: session.patreonFullName,
    });

    setSession(c, {
      ...session,
      discordUserId: user.id,
      discordAccessToken: tokens.access_token,
      oauthState: undefined,
    });

    return c.redirect("/link/complete");
  } catch (err) {
    console.error(err);
    return c.text(`Discord auth failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
  }
});

app.get("/link/complete", async (c) => {
  const session = getSession(c);
  if (!session.patreonUserId || !session.discordUserId || !session.patreonAccessToken) {
    return c.redirect("/");
  }

  try {
    const result = await syncAfterLink({
      patreonUserId: session.patreonUserId,
      discordUserId: session.discordUserId,
      patreonAccessToken: session.patreonAccessToken,
      patreonFullName: session.patreonFullName,
    });

    const guildSummary = result.guildResults
      .map((g) => `<li>Server …${g.guildId.slice(-8)}: ${g.message}</li>`)
      .join("");

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Linked</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 560px; margin: 3rem auto; padding: 0 1rem; }
  .ok { color: #16a34a; } .warn { color: #ca8a04; }
  ul { padding-left: 1.25rem; }
</style>
</head>
<body>
  <h1>Accounts linked</h1>
  <p class="${result.success ? "ok" : "warn"}">${result.message}</p>
  <p>Roles were synced on each server you're in:</p>
  <ul>${guildSummary || "<li>No servers configured</li>"}</ul>
  <p>When your Patreon pledge changes, roles update on <strong>all</strong> connected servers automatically.</p>
  <p><a href="/">Home</a></p>
</body>
</html>`);
  } catch (err) {
    return c.text(`Sync failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
  }
});

export default app;
