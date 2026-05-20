import { Hono } from "hono";
import { verifyPatreonSignature, parseWebhookPayload } from "../patreon/webhook.js";
import { syncPatronFromPatreon } from "../sync/apply-roles.js";

const app = new Hono();

app.post("/webhooks/patreon", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Patreon-Signature");
  const eventHeader = c.req.header("X-Patreon-Event") ?? "unknown";

  if (!verifyPatreonSignature(rawBody, signature)) {
    return c.text("Invalid signature", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text("Invalid JSON", 400);
  }

  const payload = parseWebhookPayload(eventHeader, body);
  if (!payload?.patreonUserId) {
    return c.json({ ok: true, skipped: "no user in payload" });
  }

  const isPledgeEvent =
    eventHeader.includes("pledge") || eventHeader.includes("member");

  try {
    const result = await syncPatronFromPatreon(payload.patreonUserId, payload.eventType, {
      webhookHint: {
        tierIds: payload.tierIds,
        patronStatus: payload.patronStatus,
        isActive: payload.isActive,
      },
      notifyUnlinked: isPledgeEvent,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error("Webhook sync error:", err);
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      500
    );
  }
});

export default app;
