export type EntitlementCreditInput = {
  plan: "BASIC" | "PRO";
  amountVnd: number;
  startsAt: Date;
  endsAt: Date;
  status?: "ACTIVE" | "CONSUMED" | "EXPIRED" | "VOID";
};

type Rational = {
  numerator: bigint;
  denominator: bigint;
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
  const totalCredit = entitlements.reduce<Rational>((total, entitlement) => {
    if (entitlement.plan !== "BASIC" || entitlement.status && entitlement.status !== "ACTIVE") {
      return total;
    }

    const totalMs = BigInt(entitlement.endsAt.getTime() - entitlement.startsAt.getTime());
    const remainingMs = BigInt(entitlement.endsAt.getTime() - at.getTime());
    if (!Number.isSafeInteger(entitlement.amountVnd) || entitlement.amountVnd <= 0 || totalMs <= 0 || remainingMs <= 0) {
      return total;
    }

    const unusedCredit = normalizeRational({
      numerator: BigInt(entitlement.amountVnd) * (remainingMs > totalMs ? totalMs : remainingMs),
      denominator: totalMs
    });
    return addRational(total, unusedCredit);
  }, { numerator: 0n, denominator: 1n });

  const roundedCredit = (totalCredit.numerator * 2n + totalCredit.denominator) / (totalCredit.denominator * 2n);
  if (roundedCredit > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Tín dụng nâng cấp vượt phạm vi số tiền an toàn.");
  }
  return Number(roundedCredit);
}

function addRational(left: Rational, right: Rational): Rational {
  const sharedDivisor = greatestCommonDivisor(left.denominator, right.denominator);
  return normalizeRational({
    numerator: left.numerator * (right.denominator / sharedDivisor) + right.numerator * (left.denominator / sharedDivisor),
    denominator: left.denominator * (right.denominator / sharedDivisor)
  });
}

function normalizeRational(value: Rational): Rational {
  const divisor = greatestCommonDivisor(value.numerator, value.denominator);
  return {
    numerator: value.numerator / divisor,
    denominator: value.denominator / divisor
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a || 1n;
}
