export type TenantPwaContext = "customer" | "admin" | "staff" | "kitchen" | "cashier" | "employee";

// A role in a URL selects presentation only. Server membership checks grant access.
export function staffPwaContext(role?: string): TenantPwaContext {
  switch (role) {
    case "OWNER":
    case "MANAGER": return "admin";
    case "WAITER": return "staff";
    case "KITCHEN": return "kitchen";
    case "CASHIER": return "cashier";
    default: return "employee";
  }
}

export function staffPwaLoginUrl(slug: string, role?: string) {
  const query = new URLSearchParams({ pwa: "1" });
  if (staffPwaContext(role) !== "employee" && role) query.set("role", role);
  return `/${encodeURIComponent(slug)}/login?${query}`;
}

export function staffPwaStartUrl(slug: string, context: TenantPwaContext) {
  const role = { admin: "MANAGER", staff: "WAITER", kitchen: "KITCHEN", cashier: "CASHIER", employee: undefined, customer: undefined }[context];
  return context === "customer" ? `/${slug}/welcome` : staffPwaLoginUrl(slug, role);
}
