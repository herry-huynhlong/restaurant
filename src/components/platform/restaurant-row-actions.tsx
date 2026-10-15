"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  activateRestaurantSubscriptionAction,
  permanentlyDeleteRestaurantAction,
  resetOwnerPasswordAction,
  restoreRestaurantAction,
  setRestaurantStatusAction,
  softDeleteRestaurantAction
} from "@/app/platform/restaurants/actions";

type RestaurantActionProps = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  status: string;
  plan: string;
  planEntitlement?: string | null;
  businessType?: string | null;
  returnTo: string;
  priceOptions?: SubscriptionPriceOption[];
  compact?: boolean;
  showStatusAction?: boolean;
  showPlanAction?: boolean;
  showResetPasswordAction?: boolean;
  showDeleteAction?: boolean;
};

type SubscriptionPriceOption = {
  id: string;
  plan: "BASIC" | "PRO";
  termMonths: number;
  priceVnd: number;
  monthlyPriceVnd: number;
  isRecommended: boolean;
};

export function PlatformRestaurantActions({
  restaurantId,
  restaurantName,
  restaurantSlug,
  status,
  plan,
  planEntitlement,
  businessType,
  returnTo,
  priceOptions = [],
  compact = false,
  showStatusAction = true,
  showPlanAction = true,
  showResetPasswordAction = true,
  showDeleteAction = true
}: RestaurantActionProps) {
  const searchParams = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const subscriptionDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const restoreDialogRef = useRef<HTMLDialogElement>(null);
  const permanentDeleteDialogRef = useRef<HTMLDialogElement>(null);
  const passwordId = useId();
  const confirmPasswordId = useId();
  const deleteSlugId = useId();
  const restoreSlugId = useId();
  const permanentDeleteSlugId = useId();
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"TRAIN" | "BASIC" | "PRO">(plan === "TRAIN" ? "TRAIN" : plan === "PRO" ? "PRO" : "BASIC");
  const [selectedEntitlement, setSelectedEntitlement] = useState<"BASIC" | "PRO">(planEntitlement === "PRO" || plan === "PRO" ? "PRO" : "BASIC");
  const [selectedTerm, setSelectedTerm] = useState("12");
  const [grantType, setGrantType] = useState<"PAID" | "PROMOTION">("PAID");
  const [deleteSlug, setDeleteSlug] = useState("");
  const [restoreSlug, setRestoreSlug] = useState("");
  const [permanentDeleteSlug, setPermanentDeleteSlug] = useState("");
  const isLocked = status === "SUSPENDED";
  const isDeleted = status === "DELETED";
  const nextStatus = isLocked ? "ACTIVE" : "SUSPENDED";
  const statusLabel = isLocked ? "Mở" : "Khóa";
  const isDrinkShop = businessType === "DRINK_SHOP";
  const availablePlans = isDrinkShop ? (["TRAIN", "BASIC"] as const) : (["TRAIN", "BASIC", "PRO"] as const);
  const currentPrice = selectedPlan === "TRAIN" ? null : priceOptions.find((price) => price.plan === selectedPlan && String(price.termMonths) === selectedTerm);
  const confirmMessage = isLocked
    ? `Mở lại nhà hàng ${restaurantName}?`
    : `Khóa nhà hàng ${restaurantName}?\n\nTất cả tài khoản thuộc nhà hàng này sẽ không thể đăng nhập hoặc sử dụng hệ thống cho đến khi được mở lại.`;

  useEffect(() => {
    if (!searchParams.get("success")) return;
    dialogRef.current?.close();
    subscriptionDialogRef.current?.close();
    deleteDialogRef.current?.close();
    restoreDialogRef.current?.close();
    permanentDeleteDialogRef.current?.close();
    setPassword("");
    setDeleteSlug("");
    setRestoreSlug("");
    setPermanentDeleteSlug("");
  }, [searchParams]);

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "items-center" : ""}`}>
      {!isDeleted && showStatusAction ? (
        <form action={setRestaurantStatusAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="status" type="hidden" value={nextStatus} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <button
            className={`rounded-md border px-2 py-1 text-sm ${isLocked ? "" : "border-red-200 text-red-700"}`}
            type="submit"
            onClick={(event) => {
              if (!window.confirm(confirmMessage)) {
                event.preventDefault();
              }
            }}
          >
            {statusLabel}
          </button>
        </form>
      ) : null}

      {!isDeleted && showPlanAction ? (
        <button className="rounded-md border px-2 py-1 text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => subscriptionDialogRef.current?.showModal()}>
          Kích hoạt/Gia hạn
        </button>
      ) : null}

      {!isDeleted && showResetPasswordAction ? <button className="rounded-md border px-2 py-1 text-sm" type="button" onClick={() => dialogRef.current?.showModal()}>
        Đặt lại mật khẩu
      </button> : null}

      {!isDeleted && showDeleteAction ? (
        <button className="rounded-md border border-red-200 px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => deleteDialogRef.current?.showModal()}>
          Xóa
        </button>
      ) : null}

      {isDeleted && showDeleteAction ? (
        <>
          <button className="rounded-md border px-2 py-1 text-sm" type="button" onClick={() => restoreDialogRef.current?.showModal()}>
            Khôi phục
          </button>
          <button className="rounded-md border border-red-200 px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => permanentDeleteDialogRef.current?.showModal()}>
            Xóa vĩnh viễn
          </button>
        </>
      ) : null}

      <dialog ref={dialogRef} className="w-full max-w-md rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={resetOwnerPasswordAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Đặt lại mật khẩu chủ quán</h2>
            <p className="mt-1 text-sm text-slate-600">Nhà hàng: {restaurantName}</p>
          </div>
          <label className="block text-sm font-medium" htmlFor={passwordId}>
            Mật khẩu mới
            <input
              id={passwordId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          <label className="block text-sm font-medium" htmlFor={confirmPasswordId}>
            Xác nhận mật khẩu
            <input
              id={confirmPasswordId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              pattern={escapePattern(password)}
              title="Xác nhận mật khẩu phải khớp."
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => dialogRef.current?.close()}>
              Hủy
            </button>
            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">
              Xác nhận
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={subscriptionDialogRef} className="w-full max-w-xl rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={activateRestaurantSubscriptionAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Kích hoạt hoặc gia hạn gói</h2>
            <p className="mt-1 text-sm text-slate-600">Nhà hàng: {restaurantName}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Gói dịch vụ
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                name="plan"
                value={selectedPlan}
                onChange={(event) => {
                  const nextPlan = event.currentTarget.value === "TRAIN" ? "TRAIN" : event.currentTarget.value === "PRO" ? "PRO" : "BASIC";
                  setSelectedPlan(nextPlan);
                  if (nextPlan !== "TRAIN") {
                    setSelectedEntitlement(nextPlan === "PRO" ? "PRO" : "BASIC");
                    setGrantType("PAID");
                  } else {
                    setGrantType("PROMOTION");
                  }
                }}
              >
                {availablePlans.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            {selectedPlan === "TRAIN" ? (
              <label className="block text-sm font-medium">
                Quyền sử dụng
                <select className="mt-1 h-10 w-full rounded-md border px-3" name="planEntitlement" value={selectedEntitlement} onChange={(event) => setSelectedEntitlement(event.currentTarget.value === "PRO" ? "PRO" : "BASIC")}>
                  <option value="BASIC">Quyền BASIC</option>
                  <option value="PRO">Quyền PRO</option>
                </select>
              </label>
            ) : (
              <input name="planEntitlement" type="hidden" value={selectedPlan === "PRO" ? "PRO" : "BASIC"} />
            )}
            <label className="block text-sm font-medium">
              Thời hạn
              <select className="mt-1 h-10 w-full rounded-md border px-3 disabled:bg-slate-100" name="termMonths" value={selectedTerm} onChange={(event) => setSelectedTerm(event.currentTarget.value)} disabled={selectedPlan === "TRAIN"}>
                <option value="3">3 tháng</option>
                <option value="6">6 tháng</option>
                <option value="12">12 tháng</option>
              </select>
              {selectedPlan === "TRAIN" ? <span className="mt-1 block text-xs text-slate-500">TRAIN dùng ngày bắt đầu và ngày hết hạn do Admin nhập.</span> : null}
            </label>
            <label className="block text-sm font-medium">
              Ngày bắt đầu
              <input className="mt-1 h-10 w-full rounded-md border px-3" name="subscriptionStart" type="date" />
            </label>
            <label className="block text-sm font-medium">
              Ngày hết hạn
              <input className="mt-1 h-10 w-full rounded-md border px-3" name="subscriptionEnd" type="date" required={selectedPlan === "TRAIN"} />
            </label>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Giá theo bảng hiện tại</p>
            <p className="mt-1 text-slate-600">
              {selectedPlan === "TRAIN" ? "Miễn phí · Không phát sinh doanh thu" : currentPrice ? `${formatVnd(currentPrice.priceVnd)} · ${formatVnd(currentPrice.monthlyPriceVnd)}/tháng` : "Kỳ giá này chưa mở bán."}
            </p>
            <p className="mt-2 text-xs text-slate-500">{selectedPlan === "TRAIN" ? "Ngày hết hạn là bắt buộc khi cấp TRAIN." : "Nếu nhập ngày hết hạn thủ công, hệ thống sẽ dùng ngày đó và vẫn lưu lịch sử thao tác."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Loại kích hoạt
              <select className="mt-1 h-10 w-full rounded-md border px-3 disabled:bg-slate-100" name="grantType" value={selectedPlan === "TRAIN" ? "PROMOTION" : grantType} disabled={selectedPlan === "TRAIN"} onChange={(event) => setGrantType(event.currentTarget.value === "PROMOTION" ? "PROMOTION" : "PAID")}>
                <option value="PAID">Hợp đồng trả phí</option>
                <option value="PROMOTION">Ưu đãi quản trị</option>
              </select>
              {selectedPlan === "TRAIN" ? <input name="grantType" type="hidden" value="PROMOTION" /> : null}
            </label>
            <label className="block text-sm font-medium">
              Ghi chú
              <input className="mt-1 h-10 w-full rounded-md border px-3" name="note" placeholder="Ví dụ: đã đối soát chuyển khoản" />
            </label>
          </div>
          {selectedPlan !== "TRAIN" && grantType === "PAID" ? (
            <label className="flex items-start gap-2 rounded-xl border bg-white p-3 text-sm">
              <input className="mt-1" name="paymentConfirmed" type="checkbox" />
              <span>Đã kiểm tra thanh toán cho hợp đồng này.</span>
            </label>
          ) : null}
          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input className="mt-1" name="confirmApply" type="checkbox" required />
            <span>Tôi xác nhận thao tác này sẽ cập nhật gói và thời hạn sử dụng của nhà hàng.</span>
          </label>
          <div className="flex justify-end gap-2">
            <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => subscriptionDialogRef.current?.close()}>
              Hủy
            </button>
            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300" type="submit" disabled={selectedPlan !== "TRAIN" && grantType === "PAID" && !currentPrice}>
              Lưu thay đổi
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={deleteDialogRef} className="w-full max-w-lg rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={softDeleteRestaurantAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <ConfirmDeleteContent
            title="Xóa nhà hàng"
            restaurantName={restaurantName}
            slug={restaurantSlug}
            slugLabel="Mã đường dẫn nhà hàng"
            warning="Nhà hàng sẽ bị đánh dấu đã xóa, không còn xuất hiện trong danh sách đang hoạt động và toàn bộ tài khoản/khách hàng không thể tiếp tục sử dụng. Dữ liệu lịch sử vẫn được giữ để có thể khôi phục khi cần."
          />
          <label className="block text-sm font-medium" htmlFor={deleteSlugId}>
            Nhập chính xác mã đường dẫn để xác nhận
            <input
              id={deleteSlugId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-red-600"
              name="confirmSlug"
              value={deleteSlug}
              onChange={(event) => setDeleteSlug(event.currentTarget.value)}
              autoComplete="off"
              required
            />
          </label>
          <DialogActions
            confirmDisabled={deleteSlug !== restaurantSlug}
            confirmClassName="bg-red-700 text-white disabled:cursor-not-allowed disabled:bg-red-200"
            confirmLabel="Xóa nhà hàng"
            onCancel={() => deleteDialogRef.current?.close()}
          />
        </form>
      </dialog>

      <dialog ref={restoreDialogRef} className="w-full max-w-lg rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={restoreRestaurantAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Khôi phục nhà hàng</h2>
            <p className="mt-1 text-sm text-slate-600">Nhà hàng: {restaurantName}</p>
            <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Sau khi khôi phục, nhà hàng ở trạng thái Chưa hoạt động để quản trị viên kiểm tra trước khi mở lại.</p>
          </div>
          <label className="block text-sm font-medium" htmlFor={restoreSlugId}>
            Nhập chính xác mã đường dẫn để xác nhận
            <input
              id={restoreSlugId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="confirmSlug"
              value={restoreSlug}
              onChange={(event) => setRestoreSlug(event.currentTarget.value)}
              autoComplete="off"
              required
            />
          </label>
          <DialogActions
            confirmDisabled={restoreSlug !== restaurantSlug}
            confirmClassName="bg-teal-700 text-white disabled:cursor-not-allowed disabled:bg-teal-200"
            confirmLabel="Khôi phục"
            onCancel={() => restoreDialogRef.current?.close()}
          />
        </form>
      </dialog>

      <dialog ref={permanentDeleteDialogRef} className="w-full max-w-lg rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={permanentlyDeleteRestaurantAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <ConfirmDeleteContent
            title="Xóa vĩnh viễn"
            restaurantName={restaurantName}
            slug={restaurantSlug}
            slugLabel="Mã đường dẫn nhà hàng"
            warning="Thao tác này không thể hoàn tác. Hệ thống sẽ từ chối nếu nhà hàng còn lịch sử gọi món, thanh toán, phiên phục vụ hoặc yêu cầu khách để bảo toàn chứng từ."
          />
          <label className="block text-sm font-medium" htmlFor={permanentDeleteSlugId}>
            Nhập chính xác mã đường dẫn để xác nhận
            <input
              id={permanentDeleteSlugId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-red-600"
              name="confirmSlug"
              value={permanentDeleteSlug}
              onChange={(event) => setPermanentDeleteSlug(event.currentTarget.value)}
              autoComplete="off"
              required
            />
          </label>
          <DialogActions
            confirmDisabled={permanentDeleteSlug !== restaurantSlug}
            confirmClassName="bg-red-800 text-white disabled:cursor-not-allowed disabled:bg-red-200"
            confirmLabel="Xóa vĩnh viễn"
            onCancel={() => permanentDeleteDialogRef.current?.close()}
          />
        </form>
      </dialog>
    </div>
  );
}

function ConfirmDeleteContent({
  title,
  restaurantName,
  slug,
  slugLabel,
  warning
}: {
  title: string;
  restaurantName: string;
  slug: string;
  slugLabel: string;
  warning: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-red-700">{title}</h2>
      <dl className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-sm">
        <div><dt className="inline font-medium">Tên nhà hàng:</dt> <dd className="inline">{restaurantName}</dd></div>
        <div><dt className="inline font-medium">{slugLabel}:</dt> <dd className="inline font-mono">{slug}</dd></div>
      </dl>
      <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{warning}</p>
    </div>
  );
}

function DialogActions({
  confirmDisabled,
  confirmClassName,
  confirmLabel,
  onCancel
}: {
  confirmDisabled: boolean;
  confirmClassName: string;
  confirmLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={onCancel}>
        Hủy
      </button>
      <button className={`rounded-md px-3 py-2 text-sm font-semibold ${confirmClassName}`} type="submit" disabled={confirmDisabled}>
        {confirmLabel}
      </button>
    </div>
  );
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}
