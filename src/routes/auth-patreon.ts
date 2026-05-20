import { Hono } from "hono";
import {
  patreonAuthorizeUrl,
  patreonCreatorAuthorizeUrl,
  exchangePatreonCode,
} from "../patreon/oauth.js";
import { fetchIdentity, fetchCreatorCampaign, registerWebhook } from "../patreon/api.js";
import { getSession, setSession, newOAuthState } from "../session.js";
import { env } from "../config.js";
import { saveCreatorToken, setAppConfig } from "../db/queries.js";
import { provisionAndSyncPatrons } from "../sync/provision-roles.js";

const app = new Hono();

app.get("/auth/patreon", (c) => {
  const creator = c.req.query("creator") === "1";
  const state = newOAuthState();
  const session = getSession(c);
  setSession(c, { ...session, oauthState: state, isCreator: creator || session.isCreator });
  const url = creator ? patreonCreatorAuthorizeUrl(state) : patreonAuthorizeUrl(state);
  return c.redirect(url);
});

app.get("/auth/patreon/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const session = getSession(c);

  if (!code || !state || state !== session.oauthState) {
    return c.text("Invalid OAuth state", 400);
  }

  try {
    const tokens = await exchangePatreonCode(code);
    const identity = await fetchIdentity(tokens.access_token);

    const isCreatorFlow = Boolean(session.isCreator);

    if (isCreatorFlow) {
      const { campaignId, tiers } = await fetchCreatorCampaign(tokens.access_token);
      saveCreatorToken({
        patreonUserId: identity.userId,
        campaignId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      setAppConfig("campaign_id", campaignId);

      const webhookUrl = `${env.APP_BASE_URL}/webhooks/patreon`;
      try {
        await registerWebhook(tokens.access_token, campaignId, webhookUrl, [
          "members:pledge:create",
          "members:pledge:update",
          "members:pledge:delete",
        ]);
      } catch (err) {
        console.warn("Webhook registration:", err);
      }

      try {
        const provision = await provisionAndSyncPatrons(tokens.access_token, campaignId);
        console.log("Tier roles provisioned:", provision);
      } catch (err) {
        console.warn("Tier role provisioning:", err);
      }

      setSession(c, {
        ...session,
        patreonUserId: identity.userId,
        patreonAccessToken: tokens.access_token,
        isCreator: true,
        campaignId,
        oauthState: undefined,
      });

      return c.redirect(`/admin?campaign=${campaignId}&tiers=${tiers.length}`);
    }

    setSession(c, {
      ...session,
      patreonUserId: identity.userId,
      patreonAccessToken: tokens.access_token,
      patreonFullName: identity.fullName ?? undefined,
      oauthState: undefined,
    });

    if (session.discordUserId) {
      return c.redirect("/link/complete");
    }
    return c.redirect("/auth/discord");
  } catch (err) {
    console.error(err);
    return c.text(`Patreon auth failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
  }
});

export default app;
