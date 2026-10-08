import type { RestaurantPlan, RestaurantRole } from "@prisma/client";

export type CommercialPlan = "BASIC" | "PRO";

export type PlanFeature =
  | "WAITER_ACCESS"
  | "MANAGER_ACCESS"
  | "KITCHEN_ACCESS"
  | "CASHIER_ACCESS"
  | "KITCHEN_FLOW"
  | "CASHIER_FLOW"
  | "PAYMENT_CONFIRM"
  | "BILL_PRINT"
  | "ADVANCED_REPORTS";

const basicFeatures = new Set<PlanFeature>([
  "WAITER_ACCESS"
]);

const proFeatures = new Set<PlanFeature>([
  "WAITER_ACCESS",
  "MANAGER_ACCESS",
  "KITCHEN_ACCESS",
  "CASHIER_ACCESS",
  "KITCHEN_FLOW",
  "CASHIER_FLOW",
  "PAYMENT_CONFIRM",
  "BILL_PRINT",
  "ADVANCED_REPORTS"
]);

export const commercialPlans: CommercialPlan[] = ["BASIC", "PRO"];

export function normalizeCommercialPlan(plan: RestaurantPlan | string | null | undefined): CommercialPlan {
  return plan === "PRO" ? "PRO" : "BASIC";
}

export function hasPlanFeature(plan: RestaurantPlan | string | null | undefined, feature: PlanFeature) {
  return (normalizeCommercialPlan(plan) === "PRO" ? proFeatures : basicFeatures).has(feature);
}

export function allowedStaffRolesForPlan(plan: RestaurantPlan | string | null | undefined): RestaurantRole[] {
  return normalizeCommercialPlan(plan) === "PRO"
    ? ["MANAGER", "WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}

export function canRoleAccessPlan(plan: RestaurantPlan | string | null | undefined, role: RestaurantRole) {
  if (role === "OWNER") return true;
  return allowedStaffRolesForPlan(plan).includes(role);
}

export function departmentLoginRolesForPlan(plan: RestaurantPlan | string | null | undefined): RestaurantRole[] {
  return normalizeCommercialPlan(plan) === "PRO"
    ? ["WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}
