import { computeEntitlement, type MemberEntitlement } from "./entitlement.js";

const PATREON_API = "https://www.patreon.com/api/oauth2/v2";

export type { MemberEntitlement };

export interface PatreonIdentity {
  userId: string;
  fullName: string | null;
  email: string | null;
  campaignId: string | null;
  activeTierIds: string[];
  pledgeStatuses: string[];
}

export interface PatreonTier {
  id: string;
  title: string;
  amountCents: number | null;
}

function parseIncluded(
  included: Array<Record<string, unknown>> | undefined
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!included) return map;
  for (const item of included) {
    const type = item.type as string;
    const id = item.id as string;
    map.set(`${type}:${id}`, item);
  }
  return map;
}

export async function fetchIdentity(accessToken: string): Promise<PatreonIdentity> {
  const params = new URLSearchParams({
    include: "memberships,memberships.currently_entitled_tiers",
    "fields[user]": "full_name,email",
    "fields[member]": "patron_status,last_charge_status",
    "fields[tier]": "title",
  });

  const res = await fetch(`${PATREON_API}/identity?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Patreon identity fetch failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    data: { id: string; relationships?: Record<string, unknown> };
    included?: Array<Record<string, unknown>>;
  };

  const included = parseIncluded(json.included);
  const userId = json.data.id;
  const attrs = (json.data as { attributes?: { full_name?: string; email?: string } })
    .attributes;

  const activeTierIds: string[] = [];
  const pledgeStatuses: string[] = [];

  const membershipRefs = (
    json.data.relationships as { memberships?: { data?: Array<{ id: string }> } }
  )?.memberships?.data;

  for (const ref of membershipRefs ?? []) {
    const member = included.get(`member:${ref.id}`);
    if (!member) continue;
    const memberAttrs = member.attributes as {
      patron_status?: string;
      last_charge_status?: string;
    };
    if (memberAttrs.patron_status) {
      pledgeStatuses.push(memberAttrs.patron_status);
    }

    const tierRefs = (
      member.relationships as { currently_entitled_tiers?: { data?: Array<{ id: string }> } }
    )?.currently_entitled_tiers?.data;

    const isActive =
      memberAttrs.patron_status === "active_patron" ||
      memberAttrs.last_charge_status === "Paid";

    if (isActive) {
      for (const tierRef of tierRefs ?? []) {
        activeTierIds.push(tierRef.id);
      }
    }
  }

  return {
    userId,
    fullName: attrs?.full_name ?? null,
    email: attrs?.email ?? null,
    campaignId: null,
    activeTierIds,
    pledgeStatuses,
  };
}

export async function fetchCreatorCampaign(
  accessToken: string
): Promise<{ campaignId: string; tiers: PatreonTier[] }> {
  const params = new URLSearchParams({
    include: "tiers",
    "fields[campaign]": "creation_name",
    "fields[tier]": "title,amount_cents,published",
  });

  const res = await fetch(`${PATREON_API}/campaigns`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Patreon campaigns fetch failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    data: Array<{ id: string }>;
    included?: Array<Record<string, unknown>>;
  };

  const campaign = json.data[0];
  if (!campaign) {
    throw new Error("No Patreon campaign found for this creator account");
  }

  const included = parseIncluded(json.included);
  const tiers: PatreonTier[] = [];

  for (const [, item] of included) {
    if (item.type !== "tier") continue;
    const attrs = item.attributes as {
      title?: string;
      amount_cents?: number;
      published?: boolean;
    };
    if (attrs.published === false) continue;
    tiers.push({
      id: item.id as string,
      title: attrs.title ?? "Unknown tier",
      amountCents: attrs.amount_cents ?? null,
    });
  }

  return { campaignId: campaign.id, tiers };
}

function parseMemberEntitlement(member: Record<string, unknown>): MemberEntitlement | null {
  const attrs = member.attributes as {
    patron_status?: string;
    last_charge_status?: string;
  };
  const userRef = (
    member.relationships as { user?: { data?: { id: string } } }
  )?.user?.data;
  if (!userRef) return null;

  const tierRefs = (
    member.relationships as {
      currently_entitled_tiers?: { data?: Array<{ id: string }> };
    }
  )?.currently_entitled_tiers?.data;

  const entitledTierIds = (tierRefs ?? []).map((t) => t.id);

  return computeEntitlement({
    patronStatus: attrs.patron_status ?? null,
    lastChargeStatus: attrs.last_charge_status ?? null,
    entitledTierIds,
  });
}

export async function fetchMemberEntitlementForUser(
  accessToken: string,
  campaignId: string,
  patreonUserId: string
): Promise<MemberEntitlement | null> {
  const filterParams = new URLSearchParams({
    include: "user,currently_entitled_tiers",
    "fields[member]": "patron_status,last_charge_status",
    "filter[user_id]": patreonUserId,
  });

  let res = await fetch(
    `${PATREON_API}/campaigns/${campaignId}/members?${filterParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.ok) {
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    if (json.data[0]) {
      return parseMemberEntitlement(json.data[0]);
    }
  }

  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      include: "user,currently_entitled_tiers",
      "fields[member]": "patron_status,last_charge_status",
      "page[count]": "100",
    });
    if (cursor) params.set("page[cursor]", cursor);

    res = await fetch(
      `${PATREON_API}/campaigns/${campaignId}/members?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Patreon members fetch failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      included?: Array<Record<string, unknown>>;
      meta?: { pagination?: { cursors?: { next?: string } } };
    };

    const included = parseIncluded(json.included);

    for (const member of json.data) {
      const userRef = (
        member.relationships as { user?: { data?: { id: string } } }
      )?.user?.data;
      if (!userRef && json.included) {
        for (const [, item] of included) {
          if (item.type === "user" && item.id === patreonUserId) {
            const ent = parseMemberEntitlement(member);
            if (ent) return ent;
          }
        }
      }
      if (userRef?.id === patreonUserId) {
        return parseMemberEntitlement(member);
      }
    }

    cursor = json.meta?.pagination?.cursors?.next;
  } while (cursor);

  return null;
}

export async function registerWebhook(
  accessToken: string,
  campaignId: string,
  webhookUrl: string,
  triggers: string[]
): Promise<{ id: string }> {
  const res = await fetch(`${PATREON_API}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "webhook",
        attributes: {
          uri: webhookUrl,
          triggers,
        },
        relationships: {
          campaign: { data: { type: "campaign", id: campaignId } },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Patreon webhook registration failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { data: { id: string } };
  return { id: json.data.id };
}

export async function listCampaignMembers(
  accessToken: string,
  campaignId: string
): Promise<
  Array<{
    patreonUserId: string;
    tierIds: string[];
    patronStatus: string | null;
  }>
> {
  const members: Array<{
    patreonUserId: string;
    tierIds: string[];
    patronStatus: string | null;
  }> = [];

  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      include: "user,currently_entitled_tiers",
      "fields[member]": "patron_status,last_charge_status",
      "page[count]": "100",
    });
    if (cursor) params.set("page[cursor]", cursor);

    const res = await fetch(
      `${PATREON_API}/campaigns/${campaignId}/members?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Patreon members list failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      included?: Array<Record<string, unknown>>;
      meta?: { pagination?: { cursors?: { next?: string } } };
    };

    const included = parseIncluded(json.included);

    for (const member of json.data) {
      const userRef = (
        member.relationships as { user?: { data?: { id: string } } }
      )?.user?.data;
      if (!userRef) continue;

      const entitlement = parseMemberEntitlement(member);
      if (!entitlement) continue;

      members.push({
        patreonUserId: userRef.id,
        tierIds: entitlement.tierIds,
        patronStatus: entitlement.patronStatus,
      });
    }

    cursor = json.meta?.pagination?.cursors?.next;
  } while (cursor);

  return members;
}
