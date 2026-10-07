import type { DiningSessionStatus } from "@prisma/client";

export const activeDiningSessionStatuses = ["OPEN", "AWAITING_PAYMENT"] satisfies DiningSessionStatus[];

export function activeDiningSessionWhere() {
  return {
    status: { in: activeDiningSessionStatuses }
  };
}
