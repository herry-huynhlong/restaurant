const debugEnabled = process.env.APP_DEBUG_LOGS === "true";

export function debugLog(message: string, metadata?: Record<string, unknown>) {
  if (!debugEnabled) return;
  console.info(message, sanitize(metadata ?? {}));
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("password")
        || normalizedKey.includes("secret")
        || normalizedKey.includes("token")
        || normalizedKey.includes("cookie")
        || normalizedKey.includes("authorization")
        || normalizedKey.includes("auth")
      ) {
        return [key, "[redacted]"];
      }

      return [key, sanitize(entry)];
    })
  );
}
