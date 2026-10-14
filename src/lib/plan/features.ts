import type { BusinessType, PlanEntitlement, RestaurantPlan, RestaurantRole } from "@prisma/client";

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

export const planFeatureLabels: Record<PlanFeature, { title: string; description: string; group: string }> = {
  WAITER_ACCESS: {
    title: "Nhân viên phục vụ",
    description: "Cho tạo và đăng nhập tài khoản phục vụ.",
    group: "Nhân sự"
  },
  MANAGER_ACCESS: {
    title: "Quản lý",
    description: "Cho tạo tài khoản quản lý nhà hàng.",
    group: "Nhân sự"
  },
  KITCHEN_ACCESS: {
    title: "Bếp",
    description: "Cho tạo tài khoản bếp.",
    group: "Nhân sự"
  },
  CASHIER_ACCESS: {
    title: "Thu ngân",
    description: "Cho tạo tài khoản thu ngân.",
    group: "Nhân sự"
  },
  KITCHEN_FLOW: {
    title: "Flow bếp",
    description: "Món chờ làm, đang làm, hoàn thành.",
    group: "Vận hành"
  },
  CASHIER_FLOW: {
    title: "Màn hình thu ngân",
    description: "Trang làm việc riêng cho thu ngân.",
    group: "Thanh toán"
  },
  PAYMENT_REQUEST: {
    title: "Khách yêu cầu thanh toán",
    description: "Khách gửi yêu cầu thanh toán từ tab Thanh toán.",
    group: "Thanh toán"
  },
  PAYMENT_CONFIRM: {
    title: "Xác nhận thanh toán",
    description: "Chủ quán/thu ngân xác nhận bill đã thanh toán.",
    group: "Thanh toán"
  },
  BILL_PRINT: {
    title: "In phiếu/bill",
    description: "In phiếu tạm tính và bill thanh toán.",
    group: "Thanh toán"
  },
  REPORTS: {
    title: "Báo cáo cơ bản",
    description: "Doanh thu, giao dịch gần đây, bộ lọc kỳ.",
    group: "Báo cáo"
  },
  ADVANCED_REPORTS: {
    title: "Báo cáo nâng cao",
    description: "Các chỉ số phân tích mở rộng khi cần.",
    group: "Báo cáo"
  }
};

export const planFeatureOrder: PlanFeature[] = [
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
];

export const basicPlanFeatures: PlanFeature[] = [
  "WAITER_ACCESS",
  "PAYMENT_REQUEST",
  "PAYMENT_CONFIRM",
  "BILL_PRINT",
  "REPORTS"
];

export const proPlanFeatures: PlanFeature[] = [
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
];

const basicFeatures = new Set<PlanFeature>(basicPlanFeatures);
const proFeatures = new Set<PlanFeature>(proPlanFeatures);

export const commercialPlans: CommercialPlan[] = ["BASIC", "PRO"];

export function effectiveCommercialPlan(
  plan: RestaurantPlan | string | null | undefined,
  businessType?: BusinessType | string | null,
  entitlement?: PlanEntitlement | CommercialPlan | string | null
): CommercialPlan {
  if (plan === "TRAIN") return normalizeEntitlement(entitlement);
  if (businessType === "DRINK_SHOP") return "BASIC";
  return normalizeCommercialPlan(plan);
}

export function normalizeCommercialPlan(plan: RestaurantPlan | string | null | undefined): CommercialPlan {
  return plan === "PRO" ? "PRO" : "BASIC";
}

export function normalizeEntitlement(entitlement: PlanEntitlement | CommercialPlan | string | null | undefined): CommercialPlan {
  return entitlement === "PRO" ? "PRO" : "BASIC";
}

export function planDisplayLabel(plan: RestaurantPlan | string | null | undefined, entitlement?: PlanEntitlement | CommercialPlan | string | null) {
  return plan === "TRAIN" ? `TRAIN · Quyền ${normalizeEntitlement(entitlement)}` : normalizeCommercialPlan(plan);
}

export function hasPlanFeature(
  plan: RestaurantPlan | string | null | undefined,
  feature: PlanFeature,
  businessType?: BusinessType | string | null,
  entitlement?: PlanEntitlement | CommercialPlan | string | null
) {
  return (effectiveCommercialPlan(plan, businessType, entitlement) === "PRO" ? proFeatures : basicFeatures).has(feature);
}

export function allowedStaffRolesForPlan(
  plan: RestaurantPlan | string | null | undefined,
  businessType?: BusinessType | string | null,
  entitlement?: PlanEntitlement | CommercialPlan | string | null
): RestaurantRole[] {
  return effectiveCommercialPlan(plan, businessType, entitlement) === "PRO"
    ? ["MANAGER", "WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}

export function canRoleAccessPlan(
  plan: RestaurantPlan | string | null | undefined,
  role: RestaurantRole,
  businessType?: BusinessType | string | null,
  entitlement?: PlanEntitlement | CommercialPlan | string | null
) {
  if (role === "OWNER") return true;
  return allowedStaffRolesForPlan(plan, businessType, entitlement).includes(role);
}

export function departmentLoginRolesForPlan(
  plan: RestaurantPlan | string | null | undefined,
  businessType?: BusinessType | string | null,
  entitlement?: PlanEntitlement | CommercialPlan | string | null
): RestaurantRole[] {
  return effectiveCommercialPlan(plan, businessType, entitlement) === "PRO"
    ? ["WAITER", "KITCHEN", "CASHIER"]
    : ["WAITER"];
}
