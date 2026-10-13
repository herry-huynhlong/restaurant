"use client";

import { useId, useRef, useState } from "react";
import {
  changePlanAction,
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
  businessType?: string | null;
  returnTo: string;
  compact?: boolean;
  showStatusAction?: boolean;
  showPlanAction?: boolean;
  showResetPasswordAction?: boolean;
  showDeleteAction?: boolean;
};

export function PlatformRestaurantActions({
  restaurantId,
  restaurantName,
  restaurantSlug,
  status,
  plan,
  businessType,
  returnTo,
  compact = false,
  showStatusAction = true,
  showPlanAction = true,
  showResetPasswordAction = true,
  showDeleteAction = true
}: RestaurantActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const restoreDialogRef = useRef<HTMLDialogElement>(null);
  const permanentDeleteDialogRef = useRef<HTMLDialogElement>(null);
  const passwordId = useId();
  const confirmPasswordId = useId();
  const deleteSlugId = useId();
  const restoreSlugId = useId();
  const permanentDeleteSlugId = useId();
  const [password, setPassword] = useState("");
  const [deleteSlug, setDeleteSlug] = useState("");
  const [restoreSlug, setRestoreSlug] = useState("");
  const [permanentDeleteSlug, setPermanentDeleteSlug] = useState("");
  const isLocked = status === "SUSPENDED";
  const isDeleted = status === "DELETED";
  const nextStatus = isLocked ? "ACTIVE" : "SUSPENDED";
  const statusLabel = isLocked ? "Mở" : "Khóa";
  const isDrinkShop = businessType === "DRINK_SHOP";
  const confirmMessage = isLocked
    ? `Mở lại nhà hàng ${restaurantName}?`
    : `Khóa nhà hàng ${restaurantName}?\n\nTất cả tài khoản thuộc nhà hàng này sẽ không thể đăng nhập hoặc sử dụng hệ thống cho đến khi được mở lại.`;

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
        <form className="flex gap-1" action={changePlanAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <select className="rounded-md border px-1 py-1 text-sm disabled:bg-slate-100" name="plan" defaultValue={isDrinkShop ? "BASIC" : plan === "PRO" ? "PRO" : "BASIC"} disabled={isDrinkShop} aria-label="Gói dịch vụ">
            <option value="BASIC">BASIC</option>
            {!isDrinkShop ? <option value="PRO">PRO</option> : null}
          </select>
          {isDrinkShop ? <input name="plan" type="hidden" value="BASIC" /> : null}
          <button className="rounded-md border px-2 py-1 text-sm" type="submit">Đổi gói</button>
        </form>
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
