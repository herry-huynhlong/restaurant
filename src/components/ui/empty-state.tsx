export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
    </section>
  );
}
