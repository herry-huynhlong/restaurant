import QRCode from "qrcode";
import { Plus } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { QrCard } from "@/components/admin/qr-card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getTableQrUrl } from "@/lib/qr";
import {
  createAreaAction,
  createTableAction,
  deleteAreaAction,
  deleteOrDeactivateTableAction,
  regenerateTableQrAction,
  updateAreaAction,
  updateTableAction
} from "@/app/[rSlug]/admin/actions";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";

export default async function TablesPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string; area?: string; status?: string; q?: string; view?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [areas, notifications] = await Promise.all([
    prisma.area.findMany({
      where: { restaurantId: access.restaurant.id },
      include: { tables: { orderBy: { name: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  const tables = areas
    .flatMap((area) => area.tables.map((table) => ({ ...table, area })))
    .filter((table) => !searchParams?.area || table.areaId === searchParams.area)
    .filter((table) => searchParams?.status === "active" ? table.isActive : searchParams?.status === "inactive" ? !table.isActive : true)
    .filter((table) => searchParams?.q ? table.name.toLowerCase().includes(searchParams.q.toLowerCase()) : true);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const qrData = await Promise.all(tables.map(async (table) => {
    const url = getTableQrUrl(baseUrl, access.restaurant.slug, table.qrToken);
    return [table.id, { url, dataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) }] as const;
  }));
  const qrMap = new Map(qrData);
  const view = searchParams?.view === "list" ? "list" : "grid";

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Khu vực & Bàn"
      userName={access.user.name}
      notifications={notifications}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <form className="rounded-lg border bg-white p-4 shadow-sm" action={createAreaAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Thêm khu vực</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <input className="h-10 rounded-md border px-3" name="name" placeholder="Tên khu vực *" required />
            <input className="h-10 rounded-md border px-3" min="0" name="sortOrder" placeholder="Thứ tự" type="number" />
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo khu vực</button>
          </div>
        </form>

        <form className="rounded-lg border bg-white p-4 shadow-sm" action={createTableAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Thêm bàn</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input className="h-10 rounded-md border px-3" name="name" placeholder="Tên bàn *" required />
            <select className="h-10 rounded-md border bg-white px-3" name="areaId" required>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input defaultChecked name="isActive" type="checkbox" /> Active</label>
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo bàn</button>
          </div>
        </form>
      </section>

      <section className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-[1fr_180px_140px_120px_auto]" action="">
          <input className="h-10 rounded-md border px-3" name="q" placeholder="Tìm theo tên bàn" defaultValue={searchParams?.q ?? ""} />
          <select className="h-10 rounded-md border bg-white px-3" name="area" defaultValue={searchParams?.area ?? ""}>
            <option value="">Tất cả khu vực</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-white px-3" name="status" defaultValue={searchParams?.status ?? ""}>
            <option value="">Tất cả</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="h-10 rounded-md border bg-white px-3" name="view" defaultValue={view}>
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
          <button className="rounded-md border px-4 py-2 text-sm font-semibold" type="submit">Lọc</button>
        </form>
      </section>

      <section className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Khu vực</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {areas.map((area) => (
            <div key={area.id} className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
              <form className="grid gap-2 sm:grid-cols-[1fr_100px_auto]" action={updateAreaAction.bind(null, access.restaurant.slug)}>
                <input name="areaId" type="hidden" value={area.id} />
                <input className="h-9 rounded-md border px-3" name="name" defaultValue={area.name} required />
                <input className="h-9 rounded-md border px-3" min="0" name="sortOrder" type="number" defaultValue={area.sortOrder} />
                <button className="rounded-md border px-3 text-sm" type="submit">Lưu</button>
              </form>
              <form action={deleteAreaAction.bind(null, access.restaurant.slug)}>
                <input name="areaId" type="hidden" value={area.id} />
                <ConfirmSubmitButton className="h-9 rounded-md border border-red-200 px-3 text-sm text-red-700" message={`Xóa khu vực ${area.name}?`}>
                  Xóa
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>

      {tables.length === 0 ? (
        <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa có bàn</h2>
          <p className="mt-2 text-sm text-slate-600">Tạo khu vực và bàn đầu tiên để bắt đầu in QR.</p>
        </section>
      ) : view === "grid" ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => (
            <TableCard key={table.id} slug={access.restaurant.slug} restaurantName={access.restaurant.name} table={table} areas={areas} qr={qrMap.get(table.id)!} />
          ))}
        </section>
      ) : (
        <section className="overflow-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {["Tên bàn", "Khu vực", "Status", "QR", "Ngày tạo", "Action"].map((item) => <th key={item} className="px-3 py-3 font-medium">{item}</th>)}
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table.id} className="border-t align-top">
                  <td className="px-3 py-3 font-semibold">{table.name}</td>
                  <td className="px-3 py-3">{table.area.name}</td>
                  <td className="px-3 py-3">{table.isActive ? "Đang hoạt động" : "Inactive"}</td>
                  <td className="px-3 py-3"><QrCard restaurantName={access.restaurant.name} tableName={table.name} qrDataUrl={qrMap.get(table.id)!.dataUrl} qrUrl={qrMap.get(table.id)!.url} /></td>
                  <td className="px-3 py-3">{new Intl.DateTimeFormat("vi-VN").format(table.createdAt)}</td>
                  <td className="px-3 py-3"><TableActions slug={access.restaurant.slug} table={table} areas={areas} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </RestaurantAdminShell>
  );
}

function TableCard({ slug, restaurantName, table, areas, qr }: { slug: string; restaurantName: string; table: any; areas: any[]; qr: { url: string; dataUrl: string } }) {
  return (
    <article className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{table.name}</h2>
          <p className="text-sm text-slate-600">{table.area.name}</p>
          <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${table.isActive ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
            {table.isActive ? "Đang hoạt động" : "Inactive"}
          </p>
        </div>
        <QrCard restaurantName={restaurantName} tableName={table.name} qrDataUrl={qr.dataUrl} qrUrl={qr.url} />
      </div>
      <TableActions slug={slug} table={table} areas={areas} />
    </article>
  );
}

function TableActions({ slug, table, areas }: { slug: string; table: any; areas: any[] }) {
  return (
    <div className="mt-4 space-y-3">
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" action={updateTableAction.bind(null, slug)}>
        <input name="tableId" type="hidden" value={table.id} />
        <input className="h-9 rounded-md border px-3" name="name" defaultValue={table.name} required />
        <select className="h-9 rounded-md border bg-white px-3" name="areaId" defaultValue={table.areaId}>
          {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={table.isActive} /> Active</label>
        <button className="rounded-md border px-3 text-sm" type="submit">Sửa</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={regenerateTableQrAction.bind(null, slug)}>
          <input name="tableId" type="hidden" value={table.id} />
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">Regenerate QR</button>
        </form>
        <form action={deleteOrDeactivateTableAction.bind(null, slug)}>
          <input name="tableId" type="hidden" value={table.id} />
          <ConfirmSubmitButton className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700" message={`Bạn có chắc muốn xóa bàn ${table.name}?`}>
            Xóa / Ngừng sử dụng
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
