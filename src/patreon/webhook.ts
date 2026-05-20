import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";
import { computeEntitlement } from "./entitlement.js";

export interface WebhookMemberPayload {
  eventType: string;
  patreonUserId: string | null;
  tierIds: string[];
  patronStatus: string | null;
  isActive: boolean;
}

function parseIncluded(
  included: Array<Record<string, unknown>> | undefined
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!included) return map;
  for (const item of included) {
    map.set(`${item.type as string}:${item.id as string}`, item);
  }
  return map;
}

export function verifyPatreonSignature(
  body: string,
  signatureHeader: string | undefined
): boolean {
  const secret = env.PATREON_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("PATREON_WEBHOOK_SECRET not set; skipping signature verification");
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac("md5", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseWebhookPayload(
  eventHeader: string,
  body: unknown
): WebhookMemberPayload | null {
  const json = body as {
    data?: Record<string, unknown>;
    included?: Array<Record<string, unknown>>;
  };

  if (!json.data) return null;

  const data = json.data;
  const attrs = (data.attributes ?? {}) as {
    patron_status?: string;
    last_charge_status?: string;
  };

  let patreonUserId: string | null = null;
  const userRef = (data.relationships as { user?: { data?: { id: string } } })?.user
    ?.data;
  if (userRef) {
    patreonUserId = userRef.id;
  } else {
    const included = parseIncluded(json.included);
    for (const [, item] of included) {
      if (item.type === "user") {
        patreonUserId = item.id as string;
        break;
      }
    }
  }

  const tierRefs = (
    data.relationships as {
      currently_entitled_tiers?: { data?: Array<{ id: string }> };
    }
  )?.currently_entitled_tiers?.data;

  const entitledTierIds = (tierRefs ?? []).map((t) => t.id);
  const isDeleted = eventHeader.includes("delete");

  const entitlement = computeEntitlement({
    patronStatus: attrs.patron_status ?? null,
    lastChargeStatus: attrs.last_charge_status ?? null,
    entitledTierIds,
    isDeleted,
  });

  return {
    eventType: eventHeader,
    patreonUserId,
    tierIds: entitlement.tierIds,
    patronStatus: entitlement.patronStatus,
    isActive: entitlement.isActive,
  };
}
