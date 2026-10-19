export type EntitlementCreditInput = {
  plan: "BASIC" | "PRO";
  amountVnd: number;
  startsAt: Date;
  endsAt: Date;
  status?: "ACTIVE" | "CONSUMED" | "EXPIRED" | "VOID";
};

/**
 * Calculates each purchased BASIC period separately. It deliberately never
 * derives a price from today's plan table, so early renewals retain the amount
 * that was actually paid for that specific term.
 */
export function calculateUnusedBasicEntitlementCredit(
  entitlements: EntitlementCreditInput[],
  at: Date
) {
  return entitlements.reduce((total, entitlement) => {
    if (entitlement.plan !== "BASIC" || entitlement.status && entitlement.status !== "ACTIVE") {
      return total;
    }

    const totalMs = entitlement.endsAt.getTime() - entitlement.startsAt.getTime();
    const remainingMs = entitlement.endsAt.getTime() - at.getTime();
    if (!Number.isSafeInteger(entitlement.amountVnd) || entitlement.amountVnd <= 0 || totalMs <= 0 || remainingMs <= 0) {
      return total;
    }

    const unusedAmount = Math.min(
      entitlement.amountVnd,
      Math.max(0, Math.round(entitlement.amountVnd * remainingMs / totalMs))
    );
    return total + unusedAmount;
  }, 0);
}
