export const platformRoutes = {
  dashboard: "/platform",
  restaurants: "/platform/restaurants",
  newRestaurant: "/platform/restaurants/new",
  restaurantDetail: (restaurantId: string) => `/platform/restaurants/${restaurantId}`,
  restaurantEdit: (restaurantId: string) => `/platform/restaurants/${restaurantId}/edit`,
  plans: "/platform/plans",
  owners: "/platform/owners",
  activity: "/platform/activity",
  settings: "/platform/settings"
};

export const restaurantRoutes = {
  home: (slug: string) => `/${slug}`,
  welcome: (slug: string) => `/${slug}/welcome`,
  menu: (slug: string) => `/${slug}/menu`,
  cart: (slug: string) => `/${slug}/cart`,
  orders: (slug: string) => `/${slug}/orders`,
  payment: (slug: string) => `/${slug}/payment`,
  admin: (slug: string) => `/${slug}/admin`,
  adminMenu: (slug: string) => `/${slug}/admin/menu`,
  adminCategories: (slug: string) => `/${slug}/admin/categories`,
  adminTables: (slug: string) => `/${slug}/admin/tables`,
  adminAreas: (slug: string) => `/${slug}/admin/areas`,
  adminOrders: (slug: string) => `/${slug}/admin/orders`,
  adminStaff: (slug: string) => `/${slug}/admin/staff`,
  adminPayments: (slug: string) => `/${slug}/admin/payments`,
  adminReports: (slug: string) => `/${slug}/admin/reports`,
  adminSettings: (slug: string) => `/${slug}/admin/settings`,
  staff: (slug: string) => `/${slug}/staff`,
  kitchen: (slug: string) => `/${slug}/kitchen`,
  cashier: (slug: string) => `/${slug}/cashier`
};
