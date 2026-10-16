export default function StaffLoading() {
  return (
    <main className="min-h-screen bg-slate-50" aria-busy="true" aria-label="Đang tải trang phục vụ">
      <div className="border-b bg-white px-4 py-4">
        <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-slate-100" />
      </div>
      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg border bg-white" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg border bg-white" />
          ))}
        </div>
      </section>
    </main>
  );
}
