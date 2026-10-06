import type { RestaurantRole } from "@prisma/client";

export const restaurantRoleRank: Record<RestaurantRole, number> = {
  OWNER: 5,
  MANAGER: 4,
  CASHIER: 3,
  WAITER: 2,
  KITCHEN: 1
};

export function hasAnyRestaurantRole(userRole: RestaurantRole, allowedRoles: RestaurantRole[]) {
  return allowedRoles.includes(userRole);
}
