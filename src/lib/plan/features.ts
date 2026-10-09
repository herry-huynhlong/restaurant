import type { BusinessType, RestaurantPlan, RestaurantRole } from "@prisma/client";

export type CommercialPlan = "BASIC" | "PRO";

export type PlanFeature =
  | "WAITER_ACCESS"
  | "MANAGER_ACCESS"
  | "KITCHEN_ACCESS"
  | "CASHIER_ACCESS"
  | "KITCHEN_FLOW"
  | "CASHIER_FLOW"
  | "PAYMENT_REQUEST"
  | "PAYMENT_CONFIRM"
  | "BILL_PRINT"
  | "REPORTS"
  | "ADVANCED_REPORTS";

const basicFeatures = new Set<PlanFeature>([
  "WAITER_ACCESS",
  "PAYMENT_REQUEST",
  "PAYMENT_CONFIRM",
  "BILL_PRINT",
  "REPORTS"
]);

const proFeatures = new Set<PlanFeature>([
  "WAITER_ACCESS",
  "MANAGER_ACCESS",
  "KITCHEN_ACCESS",
  "CASHIER_ACCESS",
  "KITCHEN_FLOW",
  "CASHIER_FLOW",
  "PAYMENT_REQUEST",
  "PAYMENT_CONFIRM",
  "BILL_PRINT",
  "REPORTS",
  "ADVANCED_REPORTS"
]);

export const commercialPlans: CommercialPlan[] = ["BASIC", "PRO"];

export function effectiveCommercialPlan(plan: RestaurantPlan | string | null | undefined, businessType?: BusinessType | string | null): CommercialPlan {
  if (businessType === "DRINK_SHOP") return "BASIC";
  return normalizeCommercialPlan(plan);
}

export function normalizeCommercialPlan(plan: RestaurantPlan | string | null | undefined): CommercialPlan {
  return plan === "PRO" ? "PRO" : "BASIC";
}

export function hasPlanFeature(plan: RestaurantPlan | string | null | undefined, feature: PlanFeature, businessType?: BusinessType | string | null) {
  return (effectiveCommercialPlan(plan, businessType) === "PRO" ? proFeatures : basicFeatures).has(feature);
}

export function allowedStaffRolesForPlan(plan: RestaurantPlan | string | null | undefined, businessType?: BusinessType | string | null): RestaurantRole[] {
  return effectiveCommercialPlan(plan, businessType) === "PRO"
    ? ["MANAGER", "WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}

export function canRoleAccessPlan(plan: RestaurantPlan | string | null | undefined, role: RestaurantRole, businessType?: BusinessType | string | null) {
  if (role === "OWNER") return true;
  return allowedStaffRolesForPlan(plan, businessType).includes(role);
}

export function departmentLoginRolesForPlan(plan: RestaurantPlan | string | null | undefined, businessType?: BusinessType | string | null): RestaurantRole[] {
  return effectiveCommercialPlan(plan, businessType) === "PRO"
    ? ["WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}
