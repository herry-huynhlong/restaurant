const forbiddenCustomerNames = new Set([
  "order",
  "guest",
  "customer",
  "anonymous"
]);

export function normalizeCustomerName(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length > 80) return null;
  if (forbiddenCustomerNames.has(normalized.toLocaleLowerCase("vi-VN"))) return null;
  return normalized;
}

export function customerGreeting(customerName: string | null | undefined, locale: "vi" | "en") {
  const name = normalizeCustomerName(customerName);
  if (locale === "en") return name ? `Hello, ${name}` : "Hello!";
  return name ? `Xin chào, ${name}` : "Xin chào!";
}

export function customerDisplayName(customerName: unknown, fallback = "Chưa có tên") {
  return normalizeCustomerName(customerName) ?? fallback;
}
