import { sanitizeFeedbackMessage } from "@/lib/safe-user-message";

export function FeedbackBanner({ success, error }: { success?: string; error?: string }) {
  const safeError = sanitizeFeedbackMessage(error, "Không thể hoàn tất thao tác. Vui lòng thử lại.");
  const safeSuccess = safeError ? undefined : sanitizeFeedbackMessage(success, "Thao tác đã hoàn tất.");
  if (!safeSuccess && !safeError) return null;
  return (
    <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${safeError ? "border-red-200 bg-red-50 text-red-700" : "border-teal-200 bg-teal-50 text-teal-800"}`}>
      {safeError ?? safeSuccess}
    </div>
  );
}
