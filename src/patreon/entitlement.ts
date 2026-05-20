export interface MemberEntitlement {
  tierIds: string[];
  patronStatus: string | null;
  isActive: boolean;
}

export interface EntitlementInput {
  patronStatus?: string | null;
  lastChargeStatus?: string | null;
  entitledTierIds?: string[];
  isDeleted?: boolean;
}

const INACTIVE_PATRON_STATUSES = new Set([
  "declined_patron",
  "former_patron",
  "fraud_patron",
  "paused_patron",
]);

export function computeEntitlement(input: EntitlementInput): MemberEntitlement {
  const patronStatus = input.patronStatus ?? null;
  const lastChargeStatus = input.lastChargeStatus ?? null;
  const rawTierIds = input.entitledTierIds ?? [];

  if (input.isDeleted) {
    return { tierIds: [], patronStatus, isActive: false };
  }

  if (patronStatus && INACTIVE_PATRON_STATUSES.has(patronStatus)) {
    return { tierIds: [], patronStatus, isActive: false };
  }

  const paid =
    lastChargeStatus === "Paid" ||
    lastChargeStatus === "paid" ||
    patronStatus === "active_patron";

  const isActive = paid && rawTierIds.length > 0;

  return {
    tierIds: isActive ? rawTierIds : [],
    patronStatus,
    isActive,
  };
}

export function parseEntitledTierIdsJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}
