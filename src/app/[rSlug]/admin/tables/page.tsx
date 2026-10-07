import Link from "next/link";
import QRCode from "qrcode";
import { MoreVertical, Plus } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { QrCard } from "@/components/admin/qr-card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getTableQrUrl } from "@/lib/qr";
import { formatVnd } from "@/lib/money";
import {
  createAreaAction,
  createTableAction,
  deleteAreaAction,
  deleteOrDeactivateTableAction,
  updateAreaAction,
  updateTableAction
} from "@/app/[rSlug]/admin/actions";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

const tableStatusLabels: Record<string, string> = {
  AVAILABLE: "Đang trống",
  OCCUPIED: "Đang phục vụ",
  WAITING_FOOD: "Đang phục vụ",
  PAYMENT_REQUESTED: "Chờ thanh toán"
};

const requestLabels: Record<string, string> = {
  CALL_STAFF: "Gọi nhân viên",
  REQUEST_WATER: "Xin nước",
  REQUEST_UTENSILS: "Xin dụng cụ",
  REQUEST_PAYMENT: "Yêu cầu thanh toán",
  OTHER: "Hỗ trợ"
};

export default async function TablesPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string; table?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [areas, notifications] = await Promise.all([
    prisma.area.findMany({
      where: { restaurantId: access.restaurant.id },
      include: {
        tables: {
          orderBy: { name: "asc" },
          include: {
            sessions: {
              where: activeDiningSessionWhere(),
              orderBy: { openedAt: "desc" },
              take: 1,
              include: {
                orders: {
                  orderBy: { createdAt: "asc" },
                  include: { items: { orderBy: { createdAt: "asc" } } }
                },
                serviceRequests: {
                  where: { status: { in: ["NEW", "ACKNOWLEDGED"] } },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  const tables = areas.flatMap((area) => area.tables.map((table) => ({ ...table, area })));
  const selectedTable = tables.find((table) => table.id === searchParams?.table) ?? tables[0] ?? null;
  const selectedSession = selectedTable?.sessions[0] ?? null;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const selectedQrUrl = selectedTable ? getTableQrUrl(baseUrl, access.restaurant.slug, selectedTable.qrToken) : null;
  const selectedQrDataUrl = selectedQrUrl ? await QRCode.toDataURL(selectedQrUrl, { margin: 1, width: 220 }) : null;

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
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo khu vực</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input className="h-10 flex-1 rounded-md border px-3" name="name" placeholder="Tên khu vực, ví dụ Khu A" required />
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo khu vực</button>
          </div>
        </form>

        <form className="rounded-lg border bg-white p-4 shadow-sm" action={createTableAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo bàn</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="h-10 rounded-md border px-3" name="name" placeholder="Tên bàn, ví dụ A01" required />
            <select className="h-10 rounded-md border bg-white px-3" name="areaId" required>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo bàn</button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          {areas.map((area) => (
            <section key={area.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{area.name}</h2>
                <AreaMenu slug={access.restaurant.slug} area={area} />
              </div>
              {area.tables.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {area.tables.map((table) => {
                    const activeSession = table.sessions[0] ?? null;
                    return (
                      <TableSummaryCard
                        key={table.id}
                        slug={access.restaurant.slug}
                        table={{ ...table, area }}
                        totalAmount={activeSession?.totalAmount ?? 0}
                        selected={selectedTable?.id === table.id}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Khu vực này chưa có bàn.</p>
              )}
            </section>
          ))}
        </div>

        <TableDetail
          slug={access.restaurant.slug}
          table={selectedTable}
          session={selectedSession}
          areas={areas}
          qrUrl={selectedQrUrl}
          qrDataUrl={selectedQrDataUrl}
          restaurantName={access.restaurant.name}
        />
      </section>
    </RestaurantAdminShell>
  );
}

function TableSummaryCard({ slug, table, totalAmount, selected }: { slug: string; table: any; totalAmount: number; selected: boolean }) {
  const label = !table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status;
  const badgeClass = !table.isActive
    ? "bg-slate-100 text-slate-600"
    : table.status === "PAYMENT_REQUESTED"
      ? "bg-amber-50 text-amber-700"
      : table.status === "AVAILABLE"
        ? "bg-slate-100 text-slate-700"
        : "bg-teal-50 text-teal-700";

  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${selected ? "ring-2 ring-teal-600" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Bàn {table.name}</h3>
          <p className="text-sm text-slate-600">{table.area.name}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>{label}</span>
      </div>
      {table.status !== "AVAILABLE" && table.isActive ? (
        <p className="mt-4 text-sm text-slate-600">Tổng hiện tại: <span className="font-bold text-teal-700">{formatVnd(totalAmount)}</span></p>
      ) : null}
      <Link className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" href={`/${slug}/admin/tables?table=${table.id}`}>
        Xem bàn
      </Link>
    </article>
  );
}

function TableDetail({ slug, table, session, areas, qrUrl, qrDataUrl, restaurantName }: { slug: string; table: any | null; session: any | null; areas: any[]; qrUrl: string | null; qrDataUrl: string | null; restaurantName: string }) {
  if (!table) {
    return <aside className="rounded-lg border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Chưa có bàn để xem chi tiết.</p></aside>;
  }

  const activeRequests = session?.serviceRequests ?? [];
  const guests = session ? Array.from(new Set([
    ...session.orders.map((order: any) => order.customerName),
    ...activeRequests.map((request: any) => request.customerName)
  ])).filter(Boolean) : [];

  return (
    <aside className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Bàn {table.name}</h2>
          <p className="text-sm text-slate-600">{table.area.name}</p>
        </div>
        <TableMenu slug={slug} table={table} areas={areas} />
      </div>

      <div className="mt-4 rounded-md bg-slate-50 p-3">
        <p className="text-sm text-slate-600">Trạng thái</p>
        <p className="font-semibold">{!table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status}</p>
      </div>

      {session ? (
        <>
          <section className="mt-4">
            <h3 className="font-semibold">Khách hiện tại</h3>
            <p className="mt-2 text-sm text-slate-600">{guests.length ? guests.join(", ") : "Chưa có tên khách."}</p>
          </section>

          <section className="mt-4">
            <h3 className="font-semibold">Món đang gọi</h3>
            {session.orders.length ? (
              <div className="mt-2 space-y-3">
                {session.orders.map((order: any) => (
                  <div key={order.id} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-semibold">Order #{order.orderNumber} · {order.customerName} · {order.status}</p>
                    <ul className="mt-2 divide-y text-sm">
                      {order.items.map((item: any) => (
                        <li key={item.id} className="flex justify-between gap-3 py-1.5">
                          <span>{item.quantity} x {item.productNameViSnapshot}</span>
                          <span>{formatVnd(item.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có món nào.</p>
            )}
          </section>

          <section className="mt-4">
            <h3 className="font-semibold">Service requests</h3>
            {activeRequests.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {activeRequests.map((request: any) => (
                  <li key={request.id} className="rounded-md bg-amber-50 p-2 text-amber-800">
                    {requestLabels[request.requestType] ?? request.requestType} · {request.customerName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Không có yêu cầu đang mở.</p>
            )}
          </section>

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <p className="font-semibold">Tổng</p>
            <p className="text-2xl font-bold text-teal-700">{formatVnd(session.totalAmount)}</p>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Bàn đang trống, chưa có phiên phục vụ.</p>
      )}

      {qrUrl && qrDataUrl ? (
        <details className="mt-5">
          <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Xem QR / Tải / In</summary>
          <div className="mt-3">
            <QrCard restaurantName={restaurantName} tableName={table.name} qrDataUrl={qrDataUrl} qrUrl={qrUrl} />
          </div>
        </details>
      ) : null}
    </aside>
  );
}

function AreaMenu({ slug, area }: { slug: string; area: any }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border bg-white p-2"><MoreVertical className="h-4 w-4" /></summary>
      <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border bg-white p-3 shadow-lg">
        <form className="space-y-2" action={updateAreaAction.bind(null, slug)}>
          <input name="areaId" type="hidden" value={area.id} />
          <input className="h-9 w-full rounded-md border px-3" name="name" defaultValue={area.name} required />
          <input name="sortOrder" type="hidden" value={area.sortOrder} />
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">Lưu khu vực</button>
        </form>
        <form className="mt-2" action={deleteAreaAction.bind(null, slug)}>
          <input name="areaId" type="hidden" value={area.id} />
          <ConfirmSubmitButton className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700" message={`Xóa khu vực ${area.name}?`}>
            Xóa khu vực
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}

function TableMenu({ slug, table, areas }: { slug: string; table: any; areas: any[] }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border bg-white p-2"><MoreVertical className="h-4 w-4" /></summary>
      <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border bg-white p-3 shadow-lg">
        <form className="space-y-2" action={updateTableAction.bind(null, slug)}>
          <input name="tableId" type="hidden" value={table.id} />
          <input className="h-9 w-full rounded-md border px-3" name="name" defaultValue={table.name} required />
          <select className="h-9 w-full rounded-md border bg-white px-3" name="areaId" defaultValue={table.areaId}>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={table.isActive} /> Đang sử dụng</label>
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">Lưu bàn</button>
        </form>
        <form className="mt-2" action={deleteOrDeactivateTableAction.bind(null, slug)}>
          <input name="tableId" type="hidden" value={table.id} />
          <ConfirmSubmitButton className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700" message={`Bạn có chắc muốn xóa/ngừng sử dụng bàn ${table.name}?`}>
            Xóa / Ngừng sử dụng
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
