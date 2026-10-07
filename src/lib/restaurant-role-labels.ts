import type { RestaurantRole } from "@prisma/client";

export const restaurantRoleLabels: Record<RestaurantRole, string> = {
  OWNER: "Chủ quán",
  MANAGER: "Quản lý",
  WAITER: "Nhân viên phục vụ",
  KITCHEN: "Bếp",
  CASHIER: "Thu ngân"
};

export const assignableRestaurantRoles: RestaurantRole[] = ["MANAGER", "WAITER", "KITCHEN", "CASHIER"];
