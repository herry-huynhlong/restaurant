export function servedUploadUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/uploads/")) return url;
  if (url.startsWith("/uploads/")) return `/api${url}`;
  return url;
}
