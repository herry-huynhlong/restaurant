export function FeedbackBanner({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-teal-200 bg-teal-50 text-teal-800"}`}>
      {error ?? success}
    </div>
  );
}
