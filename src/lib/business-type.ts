import type { BusinessType } from "@prisma/client";

export const businessTypeLabels: Record<BusinessType, string> = {
  RESTAURANT: "Nhà hàng",
  DRINK_SHOP: "Quán nước"
};

export function getBusinessTypeLabel(type: BusinessType | string | null | undefined) {
  if (!type) return "Nhà hàng";
  return businessTypeLabels[type as BusinessType] ?? String(type);
}

export function enforceBusinessPlan(type: BusinessType | string | null | undefined, plan: string | null | undefined) {
  return type === "DRINK_SHOP" ? "BASIC" : plan === "PRO" ? "PRO" : "BASIC";
}
