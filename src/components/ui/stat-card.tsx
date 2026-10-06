export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}
